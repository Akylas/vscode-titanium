import * as vscode from 'vscode';
var path = require('path');
var fs = require('fs');
var os = require('os');
var execSync = require('child_process').execSync;
var shell = require('shelljs');
var plist = require('plist');
var project_flag = ' --project-dir "' + vscode.workspace.rootPath + '"';
var info;
import * as child_process from 'child_process';


function getPlatformInfo() {
    if (!info) {
        return new Promise((resolve, reject) => {
            shell.exec("ti info -o json", function (code, stdout, stderr) {
                if (code === 0) {
                    info = JSON.parse(stdout);
                    console.log('getPlatformInfo', info);
                    resolve(info);
                } else {
                    reject(stderr);
                }
            });
        });
    } else {
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
            } else {
                vscode.window.showErrorMessage(stderr || 'error getting project config: ' + cmd);
                reject(stderr);
            }
        })
    });
}
export enum BuildOption {
    Normal = 0,
    Shadow = 1,
    Appify = 2
}
var extra_flags_map = {
    [BuildOption.Normal]: "",
    [BuildOption.Shadow]: " --shadow",
    [BuildOption.Appify]: " --appify",
}
export class TiBuild {
    private type: BuildOption;
    private tiapp: Object;
    private channel: vscode.OutputChannel
    private terminal:vscode.Terminal
    private history: Array<string>

    // private currentCommand: child_process.ChildProcess

    constructor(type: BuildOption = BuildOption.Normal) {
        this.type = type;
        this.history = [];
    }

    private updateBuildInTiApp(platform) {
        console.log('updateBuildInTiApp', platform);
        // #update build number
        return new Promise((resolve, reject) => {
            var tiappPath = path.join(vscode.workspace.rootPath, "tiapp.xml")
            if (fs.existsSync(tiappPath)) {
                fs.readFile(tiappPath, 'utf8', function (err, data: string) {
                    console.log('read file', err, data);
                    if (err) {
                        reject(err);
                        return;
                    }
                    let regex: string;
                    if (platform === "android") {
                        regex = 'android:versionCode="([\\d]*)"';
                    } else {
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
                            if (err) return console.log(err);
                        });
                        resolve();
                    } else {
                        reject('no current version');
                    }
                });
            } else {
                reject("tiapp.xml doesnt exist: " + tiappPath);
            }
        });
    }

    private copyProvisioningProfile(certPath, certName) {
        var dest = path.join(os.homedir(), 'Library/MobileDevice/Provisioning Profiles', certName + '.mobileprovision');
        if (!fs.existsSync(dest)) {
            fs.createReadStream(certPath).pipe(fs.createWriteStream(dest));
        }
    }

    private getTeamFullName(plistData) {
        return plistData.TeamName + " (" + plistData.TeamIdentifier[0] + ")"
    }

    private getUUIDAndName(target) {
        return new Promise<any>((resolve, reject) => {
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
                        let json: any = plist.parse(data);
                        this.copyProvisioningProfile(certPath, json.UUID);
                        resolve(json);
                    } else {
                        throw 'cant read ' + certPath;
                    }
                } else {
                    reject('no provisioning profile file');
                }
            }
        });
    }
    windowsWithTerminal:any[] = []
    private onTerminalClosed = (eventTerminal)=> {
        if (eventTerminal === this.terminal) {
            this.terminal = null;
        }
    }
    private executeTiCommand(c: Array<string>, saveInHistory: boolean = true) {
        if (saveInHistory) {
            const toSave = JSON.stringify(c);
            const index = this.history.indexOf(toSave);
            if (index > 0) {
                this.history.splice(index, 1);
            }
            this.history.unshift(toSave);
        }
        console.log(info);
        // if (!this.channel) {
        //     this.channel = vscode.window.createOutputChannel("titanium");
        //     (<any>vscode.window).crea
        // } else {
        //     this.channel.clear();
        // }
        const rootDir = vscode.workspace.rootPath;
        let needsDelay = false;
        if (!this.terminal) {
            needsDelay = true;
            const win:any = vscode.window;
            this.terminal = win.createTerminal({cwd:rootDir, name:"titanium"});
            if (this.windowsWithTerminal.indexOf(win) === -1) {
                this.windowsWithTerminal.push(win);
                win.onDidCloseTerminal(this.onTerminalClosed);
            }
        } else {
            // this.channel.clear();
        }
        // this.terminal.show();
        // let command = 'ti ' + c + project_flag
        //     + ' -s ' + this.tiapp['sdk-version']
        //     + extra_flags_map[this.type];
        // console.log(command);

        // if (this.currentCommand) {
        //     this.currentCommand.kill();
        // }
        
        var args = c.concat(['-s', this.tiapp['sdk-version'], extra_flags_map[this.type]])

        console.log('cwd', rootDir);
        console.log('ti', args.join(' '));

        if (needsDelay) {
            setTimeout(()=>{
                this.terminal.sendText('ti ' + args.join(' '));
            }, 50);

        } else {
            this.terminal.sendText('\x03');
            this.terminal.sendText('clear');
            this.terminal.sendText('ti ' + args.join(' '));
        }

        // this.currentCommand = child_process.spawn('ti', args, {
        //     cwd: vscode.workspace.rootPath
        // });
        // this.currentCommand.stdout.on('data', (data) => {
        //     this.terminal.re(data.toString());
        // });
        // this.currentCommand.stderr.on('data', (data) => {
        //     this.terminal.sendText(data.toString());
        // });
        // this.currentCommand.on('close', (code) => {
        //     if (code != 0) {
        //         // this.channel.append('build terminated');
        //         this.terminal.sendText('build terminated');
        //     }
        //     this.currentCommand = null;
        // });
        // this.currentCommand.on('error', (err) => {
        //     // this.channel.append('Failed to start build:' + err.toString());
        //     this.terminal.sendText('Failed to start build:' + err.toString());
        //     this.currentCommand = null;
        // });
        return this.terminal.show(true)
    }


    // private updateIOsBuildInTiApp() {
    //     // update build number
    //     let tiappPath = path.join(self.project_folder, "tiapp.xml")
    //     if (path.isfile(tiappPath)) {
    //         let tiapp = fs.readFileSync(tiappPath, 'utf-8')
    //         m = re.search('(?<=<key>CFBundleVersion<\/key>)(\s*<string>)([\d]*)(?=<\/string>)', tiapp)
    //         if (m != None):
    //             version = int(m.group(2)) + 1
    //         print('updating tiapp CFBundleVersion to ' + str(version))
    //         tiapp = re.sub('<key>CFBundleVersion</key>\s*<string>[\d]*</string>', '<key>CFBundleVersion</key><string>' + str(version) + '</string>', tiapp)
    //         f2 = open(tiappPath, encoding = 'utf-8', mode = 'w')
    //         f2.write(tiapp)
    //         f2.close()
    //     } else {
    //         print("tiapp.xml doesnt exist: " + tiappPath)
    //     }
    // }

    // private updateAndroidBuildInTiApp() {
    //     // update build number
    //     let tiappPath = os.path.join(self.project_folder, "tiapp.xml")
    //     if (os.path.isfile(tiappPath)) {
    //         f2 = open(tiappPath, encoding = 'utf-8', mode = 'r')
    //         tiapp = f2.read()
    //         f2.close()
    //         m = re.search('(?<=android:versionCode=")([\d]*)(?=")', tiapp)
    //         if (m != None):
    //             version = int(m.group(1)) + 1
    //         print('updating tiapp android:versionCode to ' + str(version))
    //         tiapp = re.sub('(?<=android:versionCode=")[\d]*(?=")', str(version), tiapp)
    //         f2 = open(tiappPath, encoding = 'utf-8', mode = 'w')
    //         f2.write(tiapp)
    //         f2.close()
    //     } else {
    //         print("tiapp.xml doesnt exist: " + tiappPath)
    //     }
    // }
    private launchAndroidSim(selected?) {
        if (selected) {
            return this.executeTiCommand(['build', '-p', 'android', '-T', 'emulator', '-C', selected]);
        }
        if (info.android.emulators.length === 0) {
            return vscode.window.showErrorMessage("No Android Emulators Configured");
        }
        if (info.android.emulators.length === 1) {
            return this.launchAndroidSim(info.android.emulators[0].id)
        }
        return vscode.window.showQuickPick(info.android.emulators.map(a => a.name))
            .then(s => this.launchAndroidSim(info.android.emulators.find(a => a.name === s).id))
    }

    private launchIosSim(family, selected?) {
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
            }
        })).then(i => this.launchIosSim(family, i.detail))
    }

    private launchSim(platform) {
        if (platform === "android") {
            return this.launchAndroidSim()
        }
        return this.launchIosSim(platform);
    }
    private launchIosDevice(profile_uuid, device?, developerName?) {
        if (device) {
            return this.executeTiCommand(['build', '-p', 'ios', '-T', 'device', '-P', profile_uuid, '-C', device, '-D', 'development', '-V', developerName]);
        }
        return this.executeTiCommand(['build', '-p', 'ios', '-T', 'device', '-P', profile_uuid, '-C', 'all', '-D', 'development']);
        // if (info.ios.devices.length === 0) {
        //     return this.launchIosDevice(profile_uuid, info.ios.device[0].udid)
        // }
        // return vscode.window.showQuickPick(info.ios.devices.map(a => a.name))
        //     .then(s => this.launchIosDevice(profile_uuid, info.ios.devices.find(a => a.name === s).udid))
    }

    private launchDevice(platform, target): any {
        if (platform === "android") {
            return this.executeTiCommand(['build', '-p', 'android', '-T', 'device', '-D', 'development']);
        } else {
            return Promise.all([
                this.pickIOSProfile(target, false),
                this.getUUIDAndName(target)
            ]).then(res => {
                return this.launchIosDevice(res[0].uuid, undefined, this.getTeamFullName(res[1]));
            })
        }
    }


    private launchPlayStore() {
        this.updateBuildInTiApp('android').then(() => {
            var keystore_path, pass, keypass;
            return vscode.window.showInputBox({ prompt: "Enter keystore path:" })
                .then(_path => {
                    keystore_path = path.resolve(vscode.workspace.rootPath, _path);
                    console.log(keystore_path);
                    return vscode.window.showInputBox({ prompt: "Enter keystore password:", password: true })
                })
                .then(_pass => {
                    pass = _pass;
                    return vscode.window.showInputBox({ prompt: "Enter key password:", password: true })
                })
                .then(_keypass => {
                    keypass = _keypass;
                    this.executeTiCommand(['build', '-p', 'android', '-T', 'dist-playstore',
                        '-K', keystore_path,
                        '-O', 'dist',
                        '-P', pass,
                        '--key-password', (keypass || pass)]);
                })
        })
    }



    private pickIOSProfile(_target, _dist) {
        // var certs = [];
        // for (var k in info.ios.certs.keychains) {
        //     certs = certs.concat(info.ios.certs.keychains[k]['distribution']);
        // }

        var profiles:any[] = info.ios.provisioning[!!_dist ? _target.replace("dist-", "") : 'development']
            .filter(o => !o.expired && !o.invalid)
            .filter(o => this.tiapp['id'].indexOf(o.appId.replace(/\*/g, "")) !== -1)
        return vscode.window.showQuickPick(profiles.map(a => {
            return {
                label: a.name,
                description: '',
                detail: a.uuid,
                profile:a
            }
        })).then(s => {
            let profile = s.profile;
            if (!profile) {
                throw "no profile found";
            }
            console.log('chose profile', profile);
            // console.log('certs', certs);
            // if (certs.length <= 1) {
            // return { profile: profile, cert: certs[0] }
            return profile
            // } else {
            //     return vscode.window.showQuickPick(certs.map(a => a.fullname))
            //         .then(s => {
            //             let cert = certs.find(a => a.fullname === s);
            //             if (!cert) {
            //                 throw "no cert found";
            //             }
            //                 return { profile: profile, cert: cert }
            //         });
            // }
        });
    }
    private launchIosDist(target) {
        this.updateBuildInTiApp('ios').then(() => {
            return this.getUUIDAndName(target).then(mobileProv => {
                if (mobileProv) {
                    return this.executeTiCommand(['build', '-p', 'ios', '-T', target, '-P', mobileProv.UUID, '-O', 'dist', '-R', '"' + this.getTeamFullName(mobileProv) + '"']);
                } else {
                    throw 'no mobprov'
                }
            }).catch(err => {
                return this.pickIOSProfile(target, true).then(profile => {
                    return this.executeTiCommand(['build', '-p', 'ios', '-T', target, '-P', profile.uuid, '-O', 'dist', '-R', '"' + profile.name + '"']);
                })
            })
        })
    }


    private launchDistAdhoc(platform, target, output?:string): any {
        console.log('launchDistAdhoc');
        let args = ['build', '-p', platform, '-T', target, '-C', 'all', '-D', 'test'];
        if (output) {
            args = args.concat(['-O', output]);
        }
        return this.updateBuildInTiApp(platform).then(() => {
            if (platform === "android") {
                return this.executeTiCommand(args);
            } else {
                this.getUUIDAndName(target).then(mobileProv => {
                    if (mobileProv) {
                        return this.executeTiCommand(args.concat(['-P', mobileProv.UUID, '-R', '"' + this.getTeamFullName(mobileProv) + '"']));
                    } else {
                        throw 'no mobprov'
                    }
                }).catch(err => {
                    return this.pickIOSProfile(target, true).then(profile => {
                        return this.executeTiCommand(args.concat(['-P', profile.uuid, '-R', '"' + profile.name + '"']));
                    })
                })

            }
        });

    }

    public pickPlatform = (_tiapp) => {
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
            } else {
                return this.pickTarget(_platform);
            }
        })
    }

    public pickTarget = (_platform) => {
        let targets = [];
        if (/ios|iphone|ipad/.test(_platform)) {
            targets = ["simulator", "simulator auto", "device", "device-adhoc", "dist-adhoc", "testflight", "dist-appstore"]
        } else if (_platform == "android") {
            targets = ["emulator", "emulator auto", "device", "dist-adhoc", "dist-playstore"]
        } else if (_platform == "mobileweb") {
            targets = ["development", "production"]
        }
        return vscode.window.showQuickPick(targets, {
            placeHolder: 'Pick a target'
        }).then(_target => {
            this.handleTarget(_platform, _target);
        })
    }

    private handleTarget(_platform, _target) {
        if (_target) {
            if (/simulator|emulator/.test(_target)) {
                return this.launchSim(_platform)

            } else if (_target === "device") {
                return this.launchDevice(_platform, _target);
            } else if (_target === "dist-playstore") {
                return this.launchPlayStore();
            } else if (_target === "dist-appstore") {
                return this.launchIosDist(_target)
            } else if (_target === "dist-adhoc") {
                return this.launchDistAdhoc(_platform, _target, 'dist')
            } else if (_target === "testflight") {
                return this.launchDistAdhoc(_platform, 'dist-appstore')
            }
        }
    }


    public launch() {
        var platform;
        var device_id;
        return getPlatformInfo().then(getProjectConfig)
            .then(this.pickPlatform)
    }
    public clean() {
        return getProjectConfig()
            .then(_tiapp => {
                this.tiapp = _tiapp;
                return this.executeTiCommand(['clean'], false);
            });
    }
    public showHistory() {
        if (this.history.length > 0) {
            return vscode.window.showQuickPick(this.history)
                .then(s => {
                    var index = this.history.indexOf(s);
                    if (index > 0) {
                        this.history.splice(index, 1);
                        this.history.unshift(s);
                    }
                    this.executeTiCommand(JSON.parse(s), false);
                })
        } else {
            return this.launch();
        }
    }
    public runLastHistory(): any {
        if (this.history.length > 0) {
            return this.executeTiCommand(JSON.parse(this.history[0]), false)
        } else {
            return this.launch();
        }
    }

    public terminateBuild(): any {
        if (this.terminal) {
            this.terminal.sendText('\x03');
        }
        // if (this.currentCommand) {
        //     console.log('terminateBuild', this.currentCommand);
        //     this.currentCommand.kill();
        //     this.currentCommand = null;
        // }
    }

    public openXCodeProject(): any {
    }
}
