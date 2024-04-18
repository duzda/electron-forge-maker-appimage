# Fork of `@reforged/maker-appimage`

An unofficial AppImage target *maker* for the [Electron Forge][1]. Designed to
manage tasks asynchroniously and synchronize the tasks only when it is required
for them to finish. 

## Usage:

Please refer to [Electron Forge documentation][3] if you don't know about
general Electron Forge configuration.

The maker itself should work *out-of-the-box* (i.e. you don't have to pass any
options to it, you only need to add it to Forge config so it will be used),
although it is recommended to at least provide the path of the icon and
`categories` for best end-user experience. An example relevant part of Electron
Forge's configuration for this *maker* may look like this:

```js
import { MakerAppImage } from "electron-forge-maker-appimage";
/* (...) */
const forgeConfig = {
  /* (...) */
  makers: [
    /* (...) */
    new MakerAppImage({
      options: {
        // Package name.
        name: "example-app",
        // Executable name.
        bin: "app",
        // Human-friendly name of the application.
        productName: "Example Electron Application",
        // `GenericName` in generated `.desktop` file.
        genericName: "Example application",
        // Path to application's icon.
        icon: "/path/to/icon.png",
        // Desktop file to be used instead of the configuration above.
        desktopFile: "/path/to/example-app.desktop",
        // Release of `AppImage/AppImageKit`, either number or "continuous".
        AppImageKitRelease: "continuous",
        // Support parsing Arch Linux '*_flags.conf' file.
        flagsFile: "true"
      }
    })
  ]
}
```

## Environment variables:

As proposed in [#4][4] and originally documented in [#4 (comment)][5],
`@reforged/maker-appimage` supports environment variables inspired on
`@electron/get` to use different mirror or CDN providing the files originally
published on GitHub as part of `AppImage/AppImageKit` releases:

- `APPIMAGEKIT_MIRROR` – contains base URL from which files are going to be
  downloaded; it should contain protocol and common path on which files
  are hosted. Currently, placeholders are resolved here, but this might be
  a subject to change (this means using them is unsafe from the point of library
  consumers).

- `APPIMAGEKIT_CUSTOM_DIR` – should contain optional name of the directory
  in which files should be placed; currently, all placeholders are resolved
  here, yet this might be a subject to change – it is guaranteed for
  `{{ version }}` to be applicable here.

- `APPIMAGEKIT_CUSTOM_FILENAME` – should contain a filename template, used
  for resolving to one of the files which are going to be downloaded by maker;
  all placeholders are applicable here and `{{ filename }}` **has to** be
  provided.

### Placeholders

- `{{ version }}` – resolves to AppImageKit version tag, e.g. `13`.

- `{{ filename }}` – resolves to any generic part of the name of files (as seen
  in AppImageKit releases) that are necessary to craft an AppImage,  e.g.
  `runtime` or `AppRun`.

- `{{ arch }}` – resolves to AppImage target architecture, e.g. `x86_64`.

- `{{ node.arch }}` – resolves to Node.js target architecture, e.g. `x64`.

[1]: https://github.com/electron/forge
[2]: https://github.com/SpacingBat3/ReForged
[3]: https://www.electronforge.io/configuration
[4]: https://github.com/SpacingBat3/ReForged/issues/4
[5]: https://github.com/SpacingBat3/ReForged/issues/4#issuecomment-1412792436