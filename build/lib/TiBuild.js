const vscode = require('vscode');
var path = require('path');
var fs = require('fs');
var os = require('os');
var execSync = require('child_process').execSync;
var shell = require('shelljs');
var plist = require('plist');
var project_flag = ' --project-dir "' + vscode.workspace.rootPath + '"';
var info;
const child_process = require('child_process');
function getPlatformInfo() {
    if (!info) {
        return new Promise((resolve, reject) => {
            shell.exec("ti info -o json", function (code, stdout, stderr) {
                if (code === 0) {
                    info = JSON.parse(stdout);
                    console.log('getPlatformInfo', info);
                    resolve(info);
                }
                else {
                    reject(stderr);
                }
            });
        });
    }
    else {
        return Promise.resolve(info);
    }
}
getPlatformInfo();
function getProjectConfig() {
    return new Promise((resolve, reject) => {
        let cmd = 'ti project -o json' + project_flag;
        shell.exec(cmd, function (code, stdout, stderr) {
            if (code === 0) {
                resolve(JSON.parse(stdout));
            }
            else {
                vscode.window.showErrorMessage(stderr || 'error getting project config: ' + cmd);
                reject(stderr);
            }
        });
    });
}
(function (BuildOption) {
    BuildOption[BuildOption["Normal"] = 0] = "Normal";
    BuildOption[BuildOption["Shadow"] = 1] = "Shadow";
    BuildOption[BuildOption["Appify"] = 2] = "Appify";
})(exports.BuildOption || (exports.BuildOption = {}));
var BuildOption = exports.BuildOption;
var extra_flags_map = {
    [BuildOption.Normal]: "",
    [BuildOption.Shadow]: " --shadow",
    [BuildOption.Appify]: " --appify",
};
class TiBuild {
    constructor(type = BuildOption.Normal) {
        this.pickPlatform = (_tiapp) => {
            this.tiapp = _tiapp;
            console.log(_tiapp);
            var targets = Object.keys(this.tiapp["deployment-targets"]).filter(a => {
                var id = a;
                if (/iphone|ipad/.test(a)) {
                    id = 'ios';
                }
                return (this.tiapp["deployment-targets"][a] === true && info[id]);
            });
            targets.push('clean');
            return vscode.window.showQuickPick(targets, {
                placeHolder: 'Pick a platform to build'
            }).then(_platform => {
                console.log(_platform);
                if (_platform == 'clean') {
                    this.executeTiCommand(['clean'], false);
                }
                else {
                    return this.pickTarget(_platform);
                }
            });
        };
        this.pickTarget = (_platform) => {
            let targets = [];
            if (/ios|iphone|ipad/.test(_platform)) {
                targets = ["simulator", "simulator auto", "device", "device-adhoc", "dist-adhoc", "testflight", "dist-appstore"];
            }
            else if (_platform == "android") {
                targets = ["emulator", "emulator auto", "device", "dist-adhoc", "dist-playstore"];
            }
            else if (_platform == "mobileweb") {
                targets = ["development", "production"];
            }
            return vscode.window.showQuickPick(targets, {
                placeHolder: 'Pick a target'
            }).then(_target => {
                this.handleTarget(_platform, _target);
            });
        };
        this.type = type;
        this.history = [];
    }
    updateBuildInTiApp(platform) {
        console.log('updateBuildInTiApp', platform);
        return new Promise((resolve, reject) => {
            var tiappPath = path.join(vscode.workspace.rootPath, "tiapp.xml");
            if (fs.existsSync(tiappPath)) {
                fs.readFile(tiappPath, 'utf8', function (err, data) {
                    console.log('read file', err, data);
                    if (err) {
                        reject(err);
                        return;
                    }
                    let regex;
                    if (platform === "android") {
                        regex = 'android:versionCode="([\\d]*)"';
                    }
                    else {
                        regex = '<key>CFBundleVersion<\/key>\\s*<string>([\\d]*)<\/string>';
                    }
                    var reg = new RegExp(regex, 'g');
                    var version = reg.exec(data);
                    console.log('updateBuildInTiApp currentVersion', version);
                    if (version) {
                        var toReplace = version[0];
                        var toReplaceWith = toReplace.replace(version[1], (parseInt(version[1]) + 1) + '');
                        var result = data.replace(toReplace, toReplaceWith);
                        fs.writeFile(tiappPath, result, 'utf8', function (err) {
                            if (err)
                                return console.log(err);
                        });
                        resolve();
                    }
                    else {
                        reject('no current version');
                    }
                });
            }
            else {
                reject("tiapp.xml doesnt exist: " + tiappPath);
            }
        });
    }
    copyProvisioningProfile(certPath, certName) {
        var dest = path.join(os.homedir(), 'Library/MobileDevice/Provisioning Profiles', certName + '.mobileprovision');
        if (!fs.existsSync(dest)) {
            fs.createReadStream(certPath).pipe(fs.createWriteStream(dest));
        }
    }
    getTeamFullName(plistData) {
        return plistData.TeamName + " (" + plistData.TeamIdentifier[0] + ")";
    }
    getUUIDAndName(target) {
        return new Promise((resolve, reject) => {
            var certsDir = path.join(vscode.workspace.rootPath, "certs");
            var certPath;
            switch (target) {
                case 'dist-appstore':
                    certPath = path.join(certsDir, 'appstore.mobileprovision');
                    break;
                case 'device':
                    certPath = path.join(certsDir, 'development.mobileprovision');
                    break;
                default:
                    certPath = path.join(certsDir, 'distribution.mobileprovision');
                    break;
            }
            if (certPath) {
                if (fs.existsSync(certPath)) {
                    let data = execSync('security cms -D -i "' + certPath + '"', { encoding: 'utf8' });
                    if (data) {
                        let json = plist.parse(data);
                        this.copyProvisioningProfile(certPath, json.UUID);
                        resolve(json);
                    }
                    else {
                        throw 'cant read ' + certPath;
                    }
                }
                else {
                    reject('no provisioning profile file');
                }
            }
        });
    }
    executeTiCommand(c, saveInHistory = true) {
        if (saveInHistory) {
            const toSave = JSON.stringify(c);
            const index = this.history.indexOf(toSave);
            if (index > 0) {
                this.history.splice(index, 1);
            }
            this.history.unshift(toSave);
        }
        console.log(info);
        if (!this.channel) {
            this.channel = vscode.window.createOutputChannel("titanium");
        }
        else {
            this.channel.clear();
        }
        if (this.currentCommand) {
            this.currentCommand.kill();
        }
        var args = c.concat(['-s', this.tiapp['sdk-version'], extra_flags_map[this.type]]);
        console.log('cwd', vscode.workspace.rootPath);
        console.log('ti', args.join(' '));
        this.currentCommand = child_process.spawn('ti', args, {
            cwd: vscode.workspace.rootPath
        });
        this.currentCommand.stdout.on('data', (data) => {
            this.channel.append(data.toString());
        });
        this.currentCommand.stderr.on('data', (data) => {
            this.channel.append(data.toString());
        });
        this.currentCommand.on('close', (code) => {
            if (code != 0) {
                this.channel.append('build terminated');
            }
            this.currentCommand = null;
        });
        this.currentCommand.on('error', (err) => {
            this.channel.append('Failed to start build:' + err.toString());
            this.currentCommand = null;
        });
        return this.channel.show();
    }
    launchAndroidSim(selected) {
        if (selected) {
            return this.executeTiCommand(['build', '-p', 'android', '-T', 'simulator', '-C', selected]);
        }
        if (info.android.emulators.length === 0) {
            return vscode.window.showErrorMessage("No Android Emulators Configured");
        }
        if (info.android.emulators.length === 1) {
            return this.launchAndroidSim(info.android.emulators[0].id);
        }
        return vscode.window.showQuickPick(info.android.emulators.map(a => a.name))
            .then(s => this.launchAndroidSim(info.android.emulators.find(a => a.name === s).id));
    }
    launchIosSim(family, selected) {
        if (selected) {
            return this.executeTiCommand(['build', '-p', 'ios', '-F', family, '-T', 'simulator', '-C', selected]);
        }
        var simulators = Object
            .keys(info.ios.simulators.ios)
            .reduce((acc, ver) => acc.concat(info.ios.simulators.ios[ver]), [])
            .filter(o => o.family === family);
        if (simulators.length === 0) {
            return vscode.window.showErrorMessage("No Ios simulators found");
        }
        if (simulators.length === 1) {
            return this.launchIosSim(family, simulators[0].udid);
        }
        return vscode.window.showQuickPick(simulators.map(a => {
            return {
                label: a.name,
                description: a.version,
                detail: a.udid
            };
        })).then(i => this.launchIosSim(family, i.detail));
    }
    launchSim(platform) {
        if (platform === "android") {
            return this.launchAndroidSim();
        }
        return this.launchIosSim(platform);
    }
    launchIosDevice(profile_uuid, device, developerName) {
        if (device) {
            return this.executeTiCommand(['build', '-p', 'ios', '-T', 'device', '-P', profile_uuid, '-C', device, '-D', 'development', '-V', developerName]);
        }
        return this.executeTiCommand(['build', '-p', 'ios', '-T', 'device', '-P', profile_uuid, '-C', 'all', '-D', 'development']);
    }
    launchDevice(platform, target) {
        if (platform === "android") {
            return this.executeTiCommand(['build', '-p', 'android', '-T', 'device', '-D', 'development']);
        }
        else {
            return Promise.all([
                this.pickIOSProfile(target, false),
                this.getUUIDAndName(target)
            ]).then(res => {
                return this.launchIosDevice(res[0].uuid, undefined, this.getTeamFullName(res[1]));
            });
        }
    }
    launchPlayStore() {
        this.updateBuildInTiApp('android').then(() => {
            var keystore_path, pass, keypass;
            return vscode.window.showInputBox({ prompt: "Enter keystore path:" })
                .then(_path => {
                keystore_path = path.resolve(vscode.workspace.rootPath, _path);
                console.log(keystore_path);
                return vscode.window.showInputBox({ prompt: "Enter keystore password:", password: true });
            })
                .then(_pass => {
                pass = _pass;
                return vscode.window.showInputBox({ prompt: "Enter key password:", password: true });
            })
                .then(_keypass => {
                keypass = _keypass;
                this.executeTiCommand(['build', '-p', 'android', '-T', 'dist-playstore',
                    '-K', keystore_path,
                    '-O', 'dist',
                    '-P', pass,
                    '--key-password', (keypass || pass)]);
            });
        });
    }
    pickIOSProfile(_target, _dist) {
        var profiles = info.ios.provisioning[!!_dist ? _target.replace("dist-", "") : 'development']
            .filter(o => !o.expired && !o.invalid)
            .filter(o => this.tiapp['id'].indexOf(o.appId.replace(/\*/g, "")) !== -1);
        return vscode.window.showQuickPick(profiles.map(a => {
            return {
                label: a.name,
                description: '',
                detail: a.uuid,
                profile: a
            };
        })).then(s => {
            let profile = s.profile;
            if (!profile) {
                throw "no profile found";
            }
            console.log('chose profile', profile);
            return profile;
        });
    }
    launchIosDist(target) {
        this.updateBuildInTiApp('ios').then(() => {
            return this.getUUIDAndName(target).then(mobileProv => {
                if (mobileProv) {
                    return this.executeTiCommand(['build', '-p', 'ios', '-T', target, '-P', mobileProv.UUID, '-O', 'dist', '-R', this.getTeamFullName(mobileProv)]);
                }
                else {
                    throw 'no mobprov';
                }
            }).catch(err => {
                return this.pickIOSProfile(target, true).then(profile => {
                    return this.executeTiCommand(['build', '-p', 'ios', '-T', target, '-P', profile.uuid, '-O', 'dist', '-R', profile.name]);
                });
            });
        });
    }
    launchDistAdhoc(platform, target, output) {
        console.log('launchDistAdhoc');
        let args = ['build', '-p', platform, '-T', target, '-C', 'all', '-D', 'test'];
        if (output) {
            args = args.concat(['-O', output]);
        }
        return this.updateBuildInTiApp(platform).then(() => {
            if (platform === "android") {
                return this.executeTiCommand(args);
            }
            else {
                this.getUUIDAndName(target).then(mobileProv => {
                    if (mobileProv) {
                        return this.executeTiCommand(args.concat(['-P', mobileProv.UUID, '-R', this.getTeamFullName(mobileProv)]));
                    }
                    else {
                        throw 'no mobprov';
                    }
                }).catch(err => {
                    return this.pickIOSProfile(target, true).then(profile => {
                        return this.executeTiCommand(args.concat(['-P', profile.uuid, '-R', profile.name]));
                    });
                });
            }
        });
    }
    handleTarget(_platform, _target) {
        if (_target) {
            if (_target === "simulator") {
                return this.launchSim(_platform);
            }
            else if (_target === "device") {
                return this.launchDevice(_platform, _target);
            }
            else if (_target === "dist-playstore") {
                return this.launchPlayStore();
            }
            else if (_target === "dist-appstore") {
                return this.launchIosDist(_target);
            }
            else if (_target === "dist-adhoc") {
                return this.launchDistAdhoc(_platform, _target, 'dist');
            }
            else if (_target === "testflight") {
                return this.launchDistAdhoc(_platform, 'dist-appstore');
            }
        }
    }
    launch() {
        var platform;
        var device_id;
        return getPlatformInfo().then(getProjectConfig)
            .then(this.pickPlatform);
    }
    clean() {
        return getProjectConfig()
            .then(_tiapp => {
            this.tiapp = _tiapp;
            return this.executeTiCommand(['clean'], false);
        });
    }
    showHistory() {
        if (this.history.length > 0) {
            return vscode.window.showQuickPick(this.history)
                .then(s => {
                var index = this.history.indexOf(s);
                if (index > 0) {
                    this.history.splice(index, 1);
                    this.history.unshift(s);
                }
                this.executeTiCommand(JSON.parse(s), false);
            });
        }
        else {
            return this.launch();
        }
    }
    runLastHistory() {
        if (this.history.length > 0) {
            return this.executeTiCommand(JSON.parse(this.history[0]), false);
        }
        else {
            return this.launch();
        }
    }
    terminateBuild() {
        if (this.currentCommand) {
            console.log('terminateBuild', this.currentCommand);
            this.currentCommand.kill();
            this.currentCommand = null;
        }
    }
    openXCodeProject() {
    }
}
exports.TiBuild = TiBuild;
//# sourceMappingURL=TiBuild.js.map