// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {BuildOption, TiBuild} from './lib/TiBuild'

let  tiBuild: TiBuild;
let  tiShadowBuild: TiBuild;

function getTiBuild(): TiBuild {
  if (!tiBuild) {
    tiBuild = new TiBuild(BuildOption.Normal);
  }
  return tiBuild;
}
function getTiShadowBuild(): TiBuild {
  if (!tiShadowBuild) {
    tiShadowBuild = new TiBuild(BuildOption.Shadow);
  }
  return tiShadowBuild;
}

export function activate(context: vscode.ExtensionContext) {
  vscode.commands.executeCommand('setContext', 'inTitaniumProject', true);
  var project_flag = ' --project-dir "'  + vscode.workspace.rootPath +'"';
  console.log('vscode-titanium is active!');

	// context.subscriptions.push(vscode.commands.registerCommand('extension.openAlloyFiles', () => {
  //   let config = vscode.workspace.getConfiguration("alloy")
  //   const editor = vscode.window.activeTextEditor;
  //   if (!editor) { return; }
  //   const document = editor.document;
  //   if (document.languageId !== "javascript") { return ; }
  //   const file_name = document.fileName;
  //   const regex = new RegExp(config['controller'] + "$");
  //   console.log(regex.toString());
  //   const style_file = file_name.replace(/controllers/, "styles").replace(regex, config["style"]);
  //   const view_file = file_name.replace(/controllers/, "views").replace(regex, config["view"]);
  //   return vscode.commands.executeCommand("workbench.action.closeOtherEditors")
  //   .then(() => vscode.commands.executeCommand("workbench.action.splitEditor"))
  //   .then(() =>vscode.workspace.openTextDocument(style_file))
  //   .then(doc=> vscode.window.showTextDocument(doc) )
  //   .then(() => vscode.commands.executeCommand("workbench.action.focusFirstEditor"))
  //   .then(() => new Promise((r,j) => setTimeout(r,500)))
  //   .then(() => vscode.commands.executeCommand("workbench.action.splitEditor"))
  //   .then(() => vscode.commands.executeCommand("workbench.action.focusFirstEditor"))
  //   .then(() =>vscode.workspace.openTextDocument(view_file))
  //   .then(doc=> vscode.window.showTextDocument(doc))
  //   .then(() => console.log("done"), (e) => console.error(e));
	// }));

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