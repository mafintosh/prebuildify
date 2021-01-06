# prebuildify

> Create and package prebuilds for native modules

```
npm install -g prebuildify
```

With `prebuildify`, all prebuilt binaries are shipped inside the package that is published to npm, which means there's no need for a separate download step like you find in [`prebuild`](https://github.com/prebuild/prebuild). The irony of this approach is that it is faster to download all prebuilt binaries for every platform when they are bundled than it is to download a single prebuilt binary as an install script.

> Always use prebuildify --[@mafintosh](https://mafinto.sh)

[![Build Status](https://travis-ci.org/prebuild/prebuildify.svg?branch=master)](https://travis-ci.org/prebuild/prebuildify)

## Usage

> **Note.** Options, environment variables and prebuild names have changed in `prebuildify@3`. Please see the documentation below. You will also need to upgrade `node-gyp-build`.

First go to your native module and make a bunch of prebuilds.

``` sh
# go to your native module
cd your-native-module
# build for all electron/node binary versions and strip out symbols
prebuildify --all --strip
# the prebuilds will be stored in ./prebuilds
ls prebuilds
```

If your module is using the new node core [N-API][n-api], then you can prebuild using the `--napi` flag:

``` sh
# prebuild for n-api
prebuildify --napi
```

Then only remaining thing you need to do now is make your module use a prebuild if one exists
for the platform/runtime you are using.

Use [node-gyp-build](https://github.com/prebuild/node-gyp-build) to do this.

``` sh
# first install node-gyp-build
npm install --save node-gyp-build
```

Then add `node-gyp-build` as an install script to your module's `package.json`:

``` js
{
  "name": "your-native-module",
  "scripts": {
    "install": "node-gyp-build"
  }
}
```

The install script will check if a compatible prebuild is bundled. If so it does nothing. If not it will run [`node-gyp rebuild`][node-gyp] to produce a build.
This means that if the user using your module has disabled install scripts your module will still work (!) as long as a compatible prebuild is bundled.

When loading your native binding from your `index.js` you should use `node-gyp-build` as will to make sure to get the right binding

``` js
// Will load a compiled build if present or a prebuild.
// If no build if found it will throw an exception
var binding = require('node-gyp-build')(__dirname)

module.exports = binding
```

An added benefit of this approach is that your native modules will work across multiple node and electron versions without having the user
need to reinstall or recompile them - as long as you produce prebuilds for all versions. With N-API you only have to produce prebuilds for every runtime.

When publishing your module to npm remember to include the `./prebuilds` folder.

That's it! Happy native hacking.

## Options

Options can be provided via (in order of precedence) the programmatic API, the CLI or environment variables. The environment variables, whether they are defined on the outside or not, are also made available to subprocesses. For example, `prebuildify --arch arm64 --strip` sets `PREBUILD_ARCH=arm64 PREBUILD_STRIP=1`.

| CLI                  | Environment          | Default                        | Description
|:---------------------|:---------------------|:-------------------------------|:------------
| `--target -t`        | -                    | Depends.                       | One or more targets\*
| `--all -a`           | -                    | `false`                        | Build all known targets.<br>Takes precedence over `--target`.
| `--napi`             | -                    | `false`                        | Make [N-API][n-api] build(s).<br>Targets default to latest node which is compatible with Electron > 3, which can be overridden with `--target`.
| `--electron-compat`  | -                    | `false`                        | Make two N-API builds, one for node and one for Electron. Provide this to make sure Electron abi is supported.
| `--debug`            | -                    | `false`                        | Make Debug build(s)
| `--arch`             | `PREBUILD_ARCH`      | [`os.arch()`]([os-arch])       | Target architecture\*\*
| `--platform`         | `PREBUILD_PLATFORM`  | [`os.platform()`][os-platform] | Target platform\*\*
| `--uv`               | `PREBUILD_UV`        | From `process.versions.uv`     | Major libuv version\*\*\*
| `--armv`             | `PREBUILD_ARMV`      | Auto-detected on ARM machines  | Numeric ARM version (e.g. 7)\*\*\*
| `--libc`             | `PREBUILD_LIBC`      | `glibc`, `musl` on Alpine      | libc flavor\*\*\*
| `--tag-uv`           | -                    | `false`                        | Tag prebuild with `uv`\*\*\*
| `--tag-armv`         | -                    | `false`                        | Tag prebuild with `armv`\*\*\*
| `--tag-libc`         | -                    | `false`                        | Tag prebuild with `libc`\*\*\*
| `--preinstall`       | -                    | -                              | Command to run before build
| `--postinstall`      | -                    | -                              | Command to run after build
| `--shell`            | `PREBUILD_SHELL`     | `'sh'` on Android              | Shell to spawn commands in
| `--artifacts`        | -                    | -                              | Directory containing additional files.<br>Recursively copied into prebuild directory.
| `--strip`            | `PREBUILD_STRIP`     | `false`                        | Enable [stripping][strip]
| `--strip-bin`        | `PREBUILD_STRIP_BIN` | `'strip'`                      | Custom strip binary
| `--node-gyp`         | `PREBUILD_NODE_GYP`  | `'node-gyp(.cmd)'`             | Custom `node-gyp` binary\*\*\*\*
| `--quiet`            | -                    | `false`                        | Suppress `node-gyp` output
| `--cwd`              | -                    | `process.cwd()`                | Working directory

\* A target takes the form of `(runtime@)?version`, where `runtime` defaults to `'node'`. For example: `-t 8.14.0 -t electron@3.0.0`. At least one of `--target`, `--all` or `--napi` must be specified.

```
prebuildify --napi  -all                     # all the napi versions that are supported by Node
prebuildify --napi --electron-compat -all    # all the napi versions that are supported by Node or Electron
prebuildify --napi                           # last napi version supported by Node
prebuildify --napi  --electron-compat        # last napi version supported by Node
prebuildify --all                            # all the targets
prebuildify -t 8.14.0 -t electron@3.0.0      # specific targets
```

\*\* The `arch` option is passed to [`node-gyp`][node-gyp] as `--target-arch`. Target architecture and platform (what you're building _for_) default to the host platform and architecture (what you're building _on_). They can be overridden for cross-compilation, in which case you'll likely also want to override the strip binary. The platform and architecture dictate the output folder. For example on Linux x64 prebuilds end up in `prebuilds/linux-x64`.

```
prebuildify --napi --electron-compat                # uses the architecture of running process
prebuildify --arch=ia32 --napi --electron-compat    # windows x86 architecture
```

\*\*\* The filenames of prebuilds are composed of _tags_ which by default include runtime and either `napi` or `abi<version>`. For example: `electron.abi40.node`. To make more specific prebuilds (for `node-gyp-build` to select) you can add additional tags. Values for these tags are auto-detected. For example, `--napi --tag-uv --tag-armv` could result in a build called `node.napi.uv1.armv8.node` if the host machine has an ARM architecture. When cross-compiling you can override values either through the relevant option (`--tag-armv --armv 7`) or the tag (`--tag-armv 7`) as a shortcut. They're separate because you may want to build a certain version without tagging the prebuild as such, assuming that the prebuild is forward compatible.

\*\*\*\* To enable the use of forks like [`nodejs-mobile-gyp`](https://www.npmjs.com/package/nodejs-mobile-gyp).

## License

MIT

[n-api]: https://nodejs.org/api/n-api.html
[node-gyp]: https://www.npmjs.com/package/node-gyp
[os-arch]: https://nodejs.org/api/os.html#os_os_arch
[os-platform]: https://nodejs.org/api/os.html#os_os_platform
[strip]: https://en.wikipedia.org/wiki/Strip_%28Unix%29
