var proc = require('child_process')
var execspawn = require('execspawn')
var os = require('os')
var path = require('path')
var fs = require('fs')
var abi = require('node-abi')
var mkdirp = require('mkdirp')
var xtend = require('xtend/immutable')

module.exports = prebuildify

function prebuildify (opts, cb) {
  opts = xtend({
    arch: os.arch(),
    platform: os.platform(),
    cwd: '.',
    targets: []
  }, opts)

  if (!opts.targets.length) {
    return cb(new Error('You must specify at least one target using --target=runtime@version'))
  }

  if (!fs.existsSync(path.join(opts.cwd, 'package.json'))) {
    return cb(new Error('No package.json found'))
  }

  opts = xtend(opts, {
    targets: opts.targets.slice(),
    env: xtend(process.env, {ARCH: opts.arch, PREBUILD_ARCH: opts.arch}),
    builds: path.join(opts.cwd, 'prebuilds', opts.platform + '-' + opts.arch),
    output: path.join(opts.cwd, 'build', opts.debug ? 'Debug' : 'Release')
  })

  mkdirp(opts.builds, function (err) {
    if (err) return cb(err)
    loop(opts, cb)
  })
}

function loop (opts, cb) {
  var next = opts.targets.shift()
  if (!next) return cb()

  run(opts.preinstall, opts.cmd, opts.env, function (err) {
    if (err) return cb(err)

    build(next.target, next.runtime, opts, function (err, filename) {
      if (err) return cb(err)

      run(opts.postinstall, opts.cmd, opts.env, function (err) {
        if (err) return cb(err)

        copySharedLibs(opts.output, opts.builds, opts, function (err) {
          if (err) return cb(err)

          var name = next.runtime + '-' + abi.getAbi(next.target, next.runtime) + '.node'
          var dest = path.join(opts.builds, name)

          fs.rename(filename, dest, function (err) {
            if (err) return cb(err)

            loop(opts, cb)
          })
        })
      })
    })
  })
}

function copySharedLibs (builds, folder, opts, cb) {
  fs.readdir(builds, function (err, files) {
    if (err) return cb()

    var libs = files.filter(function (name) {
      return /\.dylib$/.test(name) || /\.so(\.\d+)?$/.test(name) || /\.dll$/.test(name)
    })

    loop()

    function loop (err) {
      if (err) return cb(err)
      var next = libs.shift()
      if (!next) return cb()

      strip(path.join(builds, next), opts, function (err) {
        if (err) return cb(err)
        copy(path.join(builds, next), path.join(folder, next), loop)
      })
    }
  })
}

function run (cmd, cwd, env, cb) {
  if (!cmd) return cb()

  var child = execspawn(cmd, {cwd: cwd, env: env, stdio: 'inherit'})
  child.on('exit', function (code) {
    if (code) return cb(spawnError(cmd, code))
    cb()
  })
}

function build (target, runtime, opts, cb) {
  var args = [
    'rebuild',
    '--target=' + target
  ]

  if (opts.arch) {
    args.push('--target_arch=' + opts.arch)
  }

  if (runtime === 'electron') {
    args.push('--runtime=electron')
    args.push('--dist-url=https://atom.io/download/electron')
  }

  if (opts.debug) {
    args.push('--debug')
  } else {
    args.push('--release')
  }

  var child = proc.spawn(os.platform() === 'win32' ? 'node-gyp.cmd' : 'node-gyp', args, {
    cwd: opts.cwd,
    stdio: opts.quiet ? 'ignore' : 'inherit'
  })

  child.on('exit', function (code) {
    if (code) return spawnError('node-gyp', code)

    findBuild(opts.output, function (err, output) {
      if (err) return cb(err)

      strip(output, opts, function (err) {
        if (err) return cb(err)
        cb(null, output)
      })
    })
  })
}

function findBuild (dir, cb) {
  fs.readdir(dir, function (err, files) {
    if (err) return cb(err)

    files = files.filter(function (name) {
      return /\.node$/i.test(name)
    })

    if (!files.length) return cb(new Error('Could not find build'))
    cb(null, path.join(dir, files[0]))
  })
}

function strip (file, opts, cb) {
  if (!opts.strip || (opts.platform !== 'darwin' && opts.platform !== 'linux')) return cb()

  var args = opts.platform === 'darwin' ? [file, '-Sx'] : [file, '--strip-all']
  var child = proc.spawn('strip', args, {stdio: 'ignore'})

  child.on('exit', function (code) {
    if (code) return spawnError('strip', code)
    cb()
  })
}

function spawnError (name, code) {
  return new Error(name + ' exited with ' + code)
}

function copy (a, b, cb) {
  fs.stat(a, function (err, st) {
    if (err) return cb(err)
    fs.readFile(a, function (err, buf) {
      if (err) return cb(err)
      fs.writeFile(b, buf, function (err) {
        if (err) return cb(err)
        fs.chmod(b, st.mode, cb)
      })
    })
  })
}
