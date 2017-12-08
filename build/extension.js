const vscode = require('vscode');
const TiBuild_1 = require('./lib/TiBuild');
let tiBuild;
let tiShadowBuild;
function getTiBuild() {
    if (!tiBuild) {
        tiBuild = new TiBuild_1.TiBuild(TiBuild_1.BuildOption.Normal);
    }
    return tiBuild;
}
function getTiShadowBuild() {
    if (!tiShadowBuild) {
        tiShadowBuild = new TiBuild_1.TiBuild(TiBuild_1.BuildOption.Shadow);
    }
    return tiShadowBuild;
}
function activate(context) {
    vscode.commands.executeCommand('setContext', 'inTitaniumProject', true);
    var project_flag = ' --project-dir "' + vscode.workspace.rootPath + '"';
    console.log('vscode-titanium is active!');
    context.subscriptions.push(vscode.commands.registerCommand('extension.tiBuild', () => {
        return getTiBuild().launch();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.tiBuildShadow', () => {
        return getTiShadowBuild().launch();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.tiBuildAppify', () => {
        return getTiShadowBuild().launch();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.tiClean', () => {
        return getTiBuild().clean();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.tiRunLastBuild', () => {
        return getTiBuild().runLastHistory();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.tiShowBuildHistory', () => {
        return getTiBuild().showHistory();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.tiTerminateBuild', () => {
        return getTiBuild().terminateBuild();
    }));
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map