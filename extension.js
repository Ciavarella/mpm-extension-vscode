/**
 * The module 'vscode' contains the VS Code extensibility API.
 */
const vscode = require('vscode');
const fetch = require('node-fetch');
require('dotenv').config();
const EventEmitter = require('events');

/**
 * This method is called when the extension is activated.
 * The initSpotify method is called after a message is presented.
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  let disposable = vscode.commands.registerCommand('extension.mpm', function() {
    vscode.window.showInformationMessage('Music Per Minute');
  });

  class MyEmitter extends EventEmitter {}
  const myEmitter = new MyEmitter();

  let token = '';
  let counter = 0;
  let prevCount = 0;

  /**
   * Adds one to the counter.
   */
  myEmitter.on('keystroke', () => {
    counter++;
  });

  /**
   * Removes one from the counter if the counter not is on 0.
   */
  myEmitter.on('backspace', () => {
    if (counter !== 0) {
      counter = counter - 2;
    }
  });

  /**
   * Compares the counter and the previous value.
   * Checks if it should play or pause music.
   * Calls the play or pause method.
   */
  myEmitter.on('check', () => {
    if (counter === 1 && prevCount !== 2) {
      playMusic();
    }
    if (counter === 0 && prevCount !== 0) {
      pauseMusic();
    }
  });

  /**
   * Sets the position of the statusbar counter.
   */
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );

  /**
   * Checks if there is a api key saved in globalstate.
   * If not calls the requestSpotifyAccess.
   * Calls the checkValidToken to check if the token is valid.
   */
  const checkApiKey = () => {
    let key = context.globalState.get('api_key');
    if (key === undefined) {
      requestSpotifyAccess();
      showTokenPlaceholder();
    } else {
      token = key;
      checkValidToken();
    }
  };

  const checkValidToken = () => {
    const bearer = 'Bearer ' + token;
    // @ts-ignore
    fetch('https://api.spotify.com/v1/me', {
      method: 'GET',
      headers: {
        Authorization: bearer,
        'Content-Type': 'application/json'
      }
    }).then(res => {
      if (res.status !== 200) {
        requestNewToken();
      }
    });
  };

  const requestNewToken = () => {
    let refreshKey = context.globalState.get('refresh_key');
    //@ts-ignore
    fetch(
      `https://mpm-node-backend.herokuapp.com/refresh_token?refresh_token=${refreshKey}`,
      {
        method: 'GET'
      }
    )
      .then(data => data.json())
      // update context api_key.
      // set token to api_key.
      .then(token => console.log(token.acccess_token));
  };

  /**
   * Opens the Spotify helper to authenticate access
   */
  const requestSpotifyAccess = () => {
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse('https://mpm-template.herokuapp.com/index.html')
    );
  };

  /**
   * Shows a inputfield where the user enters the Spotify token.
   * Set the acccess_token and refresh_token in the globalstate.
   */
  const showTokenPlaceholder = () => {
    vscode.window
      .showInputBox({
        ignoreFocusOut: true,
        prompt: 'Enter your Spotify token here'
      })
      .then(usertoken => {
        const str = usertoken;
        let pos = str.indexOf('?refresh_token=');
        const refresh_token = str.slice(pos + 15);
        const access_token = str.slice(0, pos);
        token = access_token;
        context.globalState.update('api_key', token);
        context.globalState.update('refresh_key', refresh_token);
        console.log('refreshTOKEN: ', refresh_token);
        pauseMusic();
      })
      //@ts-ignore
      .catch(err => console.log(err));
  };

  /**
   * Will check if the key pressed is backspace.
   * Call an event emitters to check time and keystroke.
   */
  const checkInput = event => {
    if (event.contentChanges[0].text === '') {
      myEmitter.emit('backspace');
    }
    myEmitter.emit('keystroke');
    myEmitter.emit('check');
  };

  /**
   * This method will decrement the counter by one every second.
   * Call an event emitter to check the time left.
   * Call the create statusbar method.
   */
  const decrementCounter = () => {
    prevCount = counter;
    if (counter !== 0) {
      counter--;
    }
    myEmitter.emit('check');
    createStatusBarItem();
  };

  /**
   * Creates the status bar timer and shows time left.
   */
  const createStatusBarItem = () => {
    item.text = `${counter.toString()} seconds left`;
    item.show();
  };

  /**
   * Starts to play music on Spotify
   */
  const playMusic = () => {
    const bearer = 'Bearer ' + token;
    // @ts-ignore
    fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: {
        Authorization: bearer,
        'Content-Type': 'application/json'
      }
    });
  };

  /**
   * Pauses music on Spotify
   */
  const pauseMusic = () => {
    const bearer = 'Bearer ' + token;
    // @ts-ignore
    fetch('https://api.spotify.com/v1/me/player/pause', {
      method: 'PUT',
      headers: {
        Authorization: bearer,
        'Content-Type': 'application/json'
      }
    });
  };

  checkApiKey();
  setInterval(decrementCounter, 1000);
  vscode.workspace.onDidChangeTextDocument(checkInput);
  context.subscriptions.push(disposable);
}
exports.activate = activate;
// this method is called when the extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate
};
