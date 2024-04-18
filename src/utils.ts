import EventEmitter from "events";
import { createHash, getHashes } from "crypto";
import { Mode, existsSync } from "fs";
import { execFileSync } from "child_process";

import { coerce } from "semver";

import type { MakerOptions } from "@electron-forge/maker-base"
import type { SemVer } from "semver"

type AppImageArch = "x86_64"|"aarch64"|"armhf"|"i686";
export type ForgeArch = "x64" | "arm64" | "armv7l" | "ia32" | "mips64el" | "universal";
type ModeFunction = (source:string,destination:string) => Mode|Promise<Mode>;

export interface MakerMeta extends MakerOptions {
  targetArch: ForgeArch;
}

interface ImageMetadata {
  type: "PNG"|"SVG"|"XPM3"|"XPM2";
  width: number|null;
  height: number|null;
}

/** Function argument definitions for {@linkcode mkSqFsEvt}. */
interface mkSqFSListenerArgs {
  close: [
    /** A returned code when process normally exits. */
    code: number|null,
    /** A signal which closed the process. */
    signal:NodeJS.Signals|null,
    /** A message printed to STDERR, if available. */
    msg?:string
  ];
  progress: [
    /** A number from range 0-100 indicating the current progress made on creating the image. */
    percent: number
  ];
  error: [
    error: Error
  ];
};

type mkSqFSEvtListen<T extends keyof mkSqFSListenerArgs> = [
  eventName: T,
  listener: (..._:mkSqFSListenerArgs[T]) => void
];

type mkSqFSEvtEmit<T extends keyof mkSqFSListenerArgs> = [
  event: T,
  ..._:mkSqFSListenerArgs[T]
];

/** An `EventListener` interface with parsed events from mksquashfs child process. */
interface mkSqFsEvt extends EventEmitter {
  /**
   * Emitted when `mksquashfs` process has been closed.
   */
  on(..._:mkSqFSEvtListen<"close">): this;
  /**
   * Emitted once `mksquashfs` process has been closed.
   */
  once(..._:mkSqFSEvtListen<"close">): this;
  /**
   * Emitted when `mksquashfs` process has been closed.
   */
  addListener(..._:mkSqFSEvtListen<"close">): this;
  /**
   * Emitted when `mksquashfs` process has been closed.
   */
  removeListener(..._:mkSqFSEvtListen<"close">): this;

  /**
   * Emitted whenever a progress has been made on SquashFS image generation.
   */
  on(..._:mkSqFSEvtListen<"progress">): this;
  /**
   * Emitted whenever a progress has been made on SquashFS image generation.
   */
  once(..._:mkSqFSEvtListen<"progress">): this;
  /**
   * Emitted whenever a progress has been made on SquashFS image generation.
   */
  addListener(..._:mkSqFSEvtListen<"progress">): this;
  /**
   * Emitted whenever a progress has been made on SquashFS image generation.
   */
  removeListener(..._:mkSqFSEvtListen<"progress">): this;

  /** Emitted whenever process has threw an error. */
  on(..._:mkSqFSEvtListen<"error">): this;
  /** Emitted whenever process has threw an error. */
  once(..._:mkSqFSEvtListen<"error">): this;
  /** Emitted whenever process has threw an error. */
  addListener(..._:mkSqFSEvtListen<"error">): this;
  /** Emitted whenever process has threw an error. */
  removeListener(..._:mkSqFSEvtListen<"error">): this;

  /** @internal */
  emit(..._:mkSqFSEvtEmit<"close">): boolean;
  /** @internal */
  emit(..._:mkSqFSEvtEmit<"progress">): boolean;
  /** @internal */
  emit(..._:mkSqFSEvtEmit<"error">): boolean;
}

export function generateDesktop(desktopEntry: Partial<Record<string,string|null>>, actions?: Record<string,Partial<Record<string,string|null>>&{ Name: string }>) {
  function toEscapeSeq<T>(string:T): T extends string ? string : T {
    if(typeof string === "string")
      return string
        .replaceAll(/\\(?!["`trn])/g,"\\\\")
        .replaceAll("`","\\`")
        .replaceAll("\t", "\\t")
        .replaceAll("\r", "\\r")
        .replaceAll("\n","\\n") as T extends string ? string : T
    return string as T extends string ? string : T;
  }
  const template:Record<"desktop"|"actions",string[]> = { desktop:[], actions:[] };
  let actionsKey:string|null = null;
  template.desktop.push('[Desktop Entry]');
  for(const entry of Object.entries(desktopEntry)) if(entry[0] !== "Actions" && entry[1] !== undefined && entry[1] !== null)
    template.desktop.push(entry.map(v => toEscapeSeq(v)).join('='));
  if(actions) for(const [name,record] of Object.entries(actions)) if(/[a-zA-Z]/.test(name)) {
    actionsKey === null ? actionsKey = name : actionsKey += ";"+name;
    template.actions.push('\n[Desktop Action '+name+']');
    for(const entry of Object.entries(record)) if(entry[1] !== undefined && entry[1] !== null)
      template.actions.push(entry.map(v => toEscapeSeq(v)).join('='));
  }
  if(actionsKey) template.desktop.push("Actions="+actions);
  return template.desktop.join('\n')+'\n'+template.actions.join('\n');
}

/**
 * Asynchronously copy path from `source` to `destination`, with similar logic
 * to Unix `cp -R` command.
 */
export async function copyPath(source:string, destination:string, dirmode: Mode|ModeFunction = 0o644) {
  const fs = Promise.all([import("fs"), import("fs/promises")])
    .then(([sync,async]) => ({...sync, ...async}));
  const path = import("path");
  async function copyDirRecursively(source:string, destination:string) {
    const jobs: Array<Promise<void>> = [];
    const items = await (await fs).readdir(source);
    const mode = typeof dirmode === "function" ? dirmode(source,destination) : dirmode;
    await (await fs).mkdir(destination, await mode);
    for(const item of items) {
      const itemPath = {
        src: (await path).resolve(source, item),
        dest: (await path).resolve(destination, item)
      }
      jobs.push((await fs).lstat(itemPath.src).then(async(stats) => {
        if(stats.isDirectory())
          await copyDirRecursively(itemPath.src, itemPath.dest);
        else if(stats.isFile())
          await (await fs).copyFile(itemPath.src, itemPath.dest);
        else if((await stats).isSymbolicLink()) {
          const target = (await path)
            .resolve(itemPath.src, await (await fs).readlink(itemPath.src));
          if((await fs).existsSync(target))
            return (await fs).symlink(
              (await path).relative(itemPath.dest, target),
              await itemPath.dest
            )
        }
      }));
    }
    return void await Promise.all(jobs);
  }
  const stats = (await fs).lstat(source);
  const resolvedDestination = destination.endsWith("/") || (await fs).existsSync(destination) ?
    import("path").then(path => path.resolve(destination, path.basename(source))) :
    destination
  if((await stats).isDirectory())
    return copyDirRecursively(source, await resolvedDestination);
  else
    return (await fs).copyFile(source, await resolvedDestination);
}

/**
 * A wrapper for `mksquashfs` binary.
 *
 * @returns An event used to watch for `mksquashfs` changes, including the job progress (in percent – as float number).
 */
export function mkSquashFs(...squashfsOptions:string[]) {
  const event:mkSqFsEvt = new EventEmitter();
  import("child_process").then(child => child.execFile)
    .then(execFile => {
      const mkSquashFS = execFile("mksquashfs", squashfsOptions, {
        windowsHide: true,
        env: {
          PATH: process.env["PATH"],
          SOURCE_DATE_EPOCH: process.env["SOURCE_DATE_EPOCH"]
        }
      });
      let lastProgress = 0;
      let stderrCollector = "";
      mkSquashFS.stderr?.on("data", (chunk:unknown) => {
        switch(true) {
          //@ts-expect-error falls through
          case chunk instanceof ArrayBuffer:
            chunk = Buffer.from(chunk);
          //@ts-expect-error falls through
          case chunk instanceof Buffer:
            chunk = (chunk as Buffer).toString();
          case chunk instanceof String:
            stderrCollector+=(chunk as string);
            break;
          default:
            throw new TypeError("Unresolved chunk type.")
        }
      })
      mkSquashFS.stdout?.on("data", (chunk) => {
        const message = chunk.toString();
        const progress = message.match(/\] [0-9/]+ ([0-9]+)%/)?.[1];
        if(progress !== undefined) {
          const progInt = parseInt(progress,10);
          if(progInt >= 0 && progInt <= 100 &&
            progInt !== lastProgress && event.emit("progress", progInt/100))
              lastProgress = progInt;
        }
      });
      mkSquashFS.once("close", (...args) => event.emit(
        "close",
        ...args,
        stderrCollector === "" ? undefined : stderrCollector
      ));
      mkSquashFS.on("error", (error) => event.emit("error", error));
    });
  return event;
}

/**
 * Returns the version of `mksquashfs` binary, as `SemVer` value.
 *
 * Under the hood, it executes `mksquashfs` with `-version`, parses
 * the `stdout` and tries to coerce it to `SemVer`.
 */
export function getSquashFsVer() {
  let output:string|SemVer|undefined|null = execFileSync("mksquashfs",["-version"],{
    encoding: "utf8",
    timeout: 3000,
    maxBuffer: 768,
    windowsHide: true,
    env: { PATH: process.env["PATH"] }
  }).split('\n')[0];
  if(output === undefined)
    throw new TypeError("Unable to parse '-version': first line read error.");
  output = /(?<=version )[0-9.]+/.exec(output)?.[0];
  if(output === undefined)
    throw new TypeError("Unable to parse '-version': number not found.");
  output = coerce(output);
  if(output === null)
    throw new Error(`Unable to coerce string '${output}' to SemVer.`);
  return output;
};

/**
 * Concatenates files and/or buffers into a new buffer.
 */
export async function joinFiles(...filesAndBuffers:(string|Buffer)[]) {
  const {readFile} = await import("fs/promises");
  const bufferArray: Promise<Buffer>[] = [];
  for(const path of filesAndBuffers)
    if(Buffer.isBuffer(path))
      bufferArray.push(Promise.resolve(path));
    else if (existsSync(path))
      bufferArray.push(readFile(path));
    else
      throw new Error(`Unable to concat '${path}': Invalid path.`);
  return Promise.all(bufferArray).then(array => Buffer.concat(array))
}

/**
 * Maps Node.js architecture to the AppImage-friendly format.
 */
export function mapArch(arch:ForgeArch):AppImageArch {
  switch(arch) {
  /*________________________________________________________________________*/
  /*  [Forge]    :                     [AppImage]                           */
    case "x64"   : return "x86_64";
    case "ia32"  : return "i686";
    case "arm64" : return "aarch64";
    case "armv7l": return "armhf";
    default      : throw new Error("Unsupported architecture: '"+arch+"'.");
  /*________________________________________________________________________*/
  /*                                                                        */
  }
}

/**
 * An object which maps files to their MD5 hashes.
 *
 * **Note:** Checksums are valid only for the assets of AppImageKit `13`.
 */
export const mapHash = Object.freeze({
  runtime: Object.freeze({
    x86_64: "37d6f0bc41f143c8c0376e874769e20a",
    i686: "498c198765ebb914e43713af4f85c5a9",
    aarch64: "d41d8cd98f00b204e9800998ecf8427e",
    armhf: "85b929e78dc59098928df1655b4b7963"
  }) satisfies Readonly<Record<AppImageArch,string>>,
  AppRun: Object.freeze({
    x86_64: "91b81afc501f78761adbf3bab49b0590",
    i686: "a16e8b7d1052a388bb9fd1e42d790434",
    aarch64: "e991d36711f99097e5c46deabb0c84a9",
    armhf: "4e7401fd36d3d4afa4963bf0a8e08221"
  }) satisfies Readonly<Record<AppImageArch,string>>
});

/**
 * A function to validate if the type of any value is like the one in
 * {@link ImageMetadata} interface.
 *
 * @param meta Any value to validate the type of.
 * @returns Whenever `meta` is an {@link ImageMetadata}-like object.
 */
function validateImageMetadata(meta: unknown):meta is ImageMetadata {
  if(typeof meta !== "object" || meta === null)
    return false;
  if(!("type" in meta) || ((meta as {type:unknown}).type !== "PNG" && (meta as {type:unknown}).type !== "SVG"))
    return false;
  if(!("width" in meta) || (typeof (meta as {width:unknown}).width !== "number" && (meta as {width:unknown}).width !== null))
    return false;
  if(!("height" in meta) || (typeof (meta as {height:unknown}).height !== "number" && (meta as {height:unknown}).height !== null))
    return false;
  return true;
}

const enum FileHeader {
  PNG = 0x89504e47,
  XPM2 = 0x58504d32,
  XPM3 = 0x58504D20
}

/**
 * A function to fetch metadata from buffer in PNG or SVG format.
 *
 * @remarks
 *
 * For PNGs, it gets required information (like image width or height)
 * from IHDR header (if it is correct according to spec), otherwise it sets
 * dimension values to `null`.
 *
 * For SVGs, it gets information about the dimensions from `<svg>` tag. If it is
 * missing, this function will return `null` for `width` and/or `height`.
 *
 * This function will also recognize file formats based on *MAGIC* headers – for
 * SVGs, it looks for existence of `<svg>` tag, for PNGs it looks if file starts
 * from the specific bytes.
 *
 * @param image PNG/SVG/XPM image buffer.
 */
export function getImageMetadata(image:Buffer):ImageMetadata {
  const svgMagic = {
    file:   /<svg ?[^>]*>/,
    width:  /<svg (?!width).*.width=["']?(\d+)(?:px)?["']?[^>]*>/,
    height: /<svg (?!height).*.height=["']?(\d+)(?:px)?["']?[^>]*>/
  };
  const partialMeta: Partial<ImageMetadata> = {};
  if(image.readUInt32BE() === FileHeader.PNG)
    partialMeta["type"] = "PNG";
  else if(image.readUInt32BE(2) === FileHeader.XPM2)
    partialMeta["type"] = "XPM2";
  else if(image.readUInt32BE(3) === FileHeader.XPM3)
    partialMeta["type"] = "XPM3";
  else if(svgMagic.file.test(image.toString("utf8")))
    partialMeta["type"] = "SVG";
  else
    throw Error("Unsupported image format (FreeDesktop spec expects images only of following MIME type: PNG, SVG and XPM).");
  switch(partialMeta.type) {
    // Based on specification by W3C: https://www.w3.org/TR/PNG/
    case "PNG": {
      const prefixIHDR = 4+image.indexOf("IHDR")
      const rawMeta = {
        width: prefixIHDR === 3 ? null : image.readInt32BE(prefixIHDR),
        height: prefixIHDR === 3 ? null : image.readInt32BE(prefixIHDR+4)
      }
      partialMeta["width"] = (rawMeta.width??0) === 0 ? null : rawMeta.width;
      partialMeta["height"] = (rawMeta.height??0) === 0 ? null : rawMeta.height;
      break;
    }
    case "SVG": {
      const svgImage = image.toString("utf8");
      const rawMeta = {
        width: parseInt(svgImage.match(svgMagic.width)?.[1]??""),
        height: parseInt(svgImage.match(svgMagic.height)?.[1]??""),
      }
      partialMeta["width"] = isNaN(rawMeta["width"]) ? null : rawMeta["width"];
      partialMeta["height"] = isNaN(rawMeta["height"]) ? null : rawMeta["height"];
      break;
    }
    default:
      if(typeof partialMeta["type"] === "string")
        throw new Error(`Not yet supported image format: '${partialMeta["type"]}'.`);
      else
        throw new TypeError(`Invalid type of 'partialMeta.type': '${typeof partialMeta["type"]}' (should be 'string')`);
  }
  if(validateImageMetadata(partialMeta))
    return partialMeta;
  throw new TypeError("Malformed function return type! ("+JSON.stringify(partialMeta)+").");
}

export function setChecksum(runtime:ArrayBuffer|Buffer,squashfs:Buffer): Buffer {
  if(!getHashes().includes("md5"))
    throw new Error("Current Node.js binary doesn't support \"md5\" digest algorithm.")
  const hashHeader = ".digest_md5";
  const buffer = runtime instanceof Buffer ? runtime : Buffer.from(runtime);
  const hashOffset = buffer.indexOf(hashHeader)+hashHeader.length;
  return Buffer.concat([
    buffer.subarray(0,hashOffset),
    createHash("md5").update(squashfs).digest(),
    buffer.subarray(hashOffset)
  ]);
}