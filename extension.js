/**
 * The module 'vscode' contains the VS Code extensibility API.
 */
const vscode = require('vscode')
const fetch = require('node-fetch')
const cp = require('child_process')
const username = require('username')
require('dotenv').config()
const EventEmitter = require('events')

/**
 * This method is called when the extension is activated.
 * The initSpotify method is called after a message is presented.
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  let disposable = vscode.commands.registerCommand('extension.mpm', function() {
    vscode.window.showInformationMessage('Music Per Minute')
  })

  class MyEmitter extends EventEmitter {}
  const myEmitter = new MyEmitter()
  const baseUrl = 'http://localhost:8080'
  let token = ''
  let counter = 0
  let prevCount = 0
  let userTotalTime = 0
  let pauseCount = 0
  let musicTime = 0
  let sessionId = null
  let intervalId = null

  /**
   * Adds one to the counter.
   */
  myEmitter.on('keystroke', () => {
    counter++
  })

  /**
   * Removes one from the counter if the counter not is on 0.
   */
  myEmitter.on('backspace', () => {
    if (counter !== 0) {
      counter = counter - 2
    }
  })

  /**
   * Compares the counter and the previous value.
   * Checks if it should play or pause music.
   * Calls the play or pause method.
   */
  myEmitter.on('check', () => {
    if (counter === 1 && prevCount !== 2) {
      let expires = context.globalState.get('expires')
      let now = Date.now() / 1000
      if (now > expires) {
        requestNewToken()
      } else {
        playMusic()
      }
    }
    if (counter === 0 && prevCount !== 0) {
      let expires = context.globalState.get('expires')
      let now = Date.now() / 1000
      if (now > expires) {
        requestNewToken()
      } else {
        pauseMusic()
      }
    }
  })

  /**
   * Sets the position of the statusbar counter.
   */
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  )

  /**
   * Checks if there is a api key saved in globalstate.
   * If not calls the requestSpotifyAccess.
   * Calls the checkValidToken to check if the token is valid.
   */
  const checkApiKey = () => {
    let key = context.globalState.get('api_key')
    if (key === undefined) {
      requestSpotifyAccess()
      showTokenPlaceholder()
    } else {
      token = key
      checkValidToken()
    }
  }

  /**
   * Checks if Spotify is open.
   * Checks the OS of the computer and sets a exec command.
   * Exec command starts Spotify.
   */
  const checkPlaybackDevice = async () => {
    const bearer = 'Bearer ' + token
    let res = await fetch('https://api.spotify.com/v1/me/player/devices', {
      method: 'GET',
      headers: {
        Authorization: bearer
      }
    })
    let data = await res.json()
    if (data.devices.length === 0) {
      let os = process.platform
      let command = ''
      if (os === 'darwin') {
        command = 'open -a spotify'
      } else if (os === 'win32') {
        let windowsUser = getWindowsUser()
        command = `start C:\Users\\${windowsUser}\AppData\Roaming\Spotify\Spotify.exe`
      } else if (os === 'linux') {
        command = 'spotify'
      }
      cp.exec(command, (err, stdout, stderr) => {
        if (err) {
          return
        }
        checkPlaybackDevice()
      })
    } else if (data.devices[0].is_active !== true) {
      let deviceId = data.devices[0].id
      activateSpotify(deviceId)
    } else {
      return
    }
  }

  /**
   * Gets the username of a Windows user.
   */
  const getWindowsUser = async () => {
    return await username()
  }

  /**
   * Initiates Spotify
   */
  const activateSpotify = deviceId => {
    const bearer = 'Bearer ' + token
    let device = {
      device_ids: [deviceId]
    }
    fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: {
        Authorization: bearer,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(device)
    })
  }

  /**
   * Checks if the current token still is valid.
   */
  const checkValidToken = async () => {
    const bearer = 'Bearer ' + token
    let res = await fetch('https://api.spotify.com/v1/me', {
      method: 'GET',
      headers: {
        Authorization: bearer,
        'Content-Type': 'application/json'
      }
    })
    if (res.status !== 200) {
      requestNewToken()
    }
    checkPlaybackDevice()
    pauseMusic()
  }

  /**
   * Request a new accesstoken with the refreshtoken.
   * Set the new acccesstoken in the global state.
   */
  const requestNewToken = async () => {
    let refreshKey = context.globalState.get('refresh_key')
    let res = await fetch(
      `https://mpm-node-backend.herokuapp.com/auth/refresh_token?refresh_token=${refreshKey}`,
      {
        method: 'GET'
      }
    )
    let data = await res.json()
    token = data.acccess_token
    let now = Date.now() / 1000
    context.globalState.update('api_key', token)
    context.globalState.update('expires', now + 3600)
    checkPlaybackDevice()
    pauseMusic()
  }

  /**
   * Gets the user and stores the user in globalState
   */
  const getUser = async () => {
    const bearer = 'Bearer ' + token
    let res = await fetch('https://api.spotify.com/v1/me', {
      method: 'GET',
      headers: {
        Authorization: bearer,
        'Content-Type': 'application/json'
      }
    })

    let user = await res.json()
    context.globalState.update('user', user)
  }

  /**
   * Opens the Spotify helper to authenticate access
   */
  const requestSpotifyAccess = () => {
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse('https://mpm-dashboard.herokuapp.com/auth/login')
    )
  }

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
        const str = usertoken
        let pos = str.indexOf('?refresh_token=')
        if (pos === -1) {
          vscode.window.showInformationMessage(
            'Could not use token, please retry'
          )
          requestSpotifyAccess()
          showTokenPlaceholder()
        } else {
          const refresh_token = str.slice(pos + 15)
          const access_token = str.slice(0, pos)
          token = access_token
          let now = Date.now() / 1000
          context.globalState.update('api_key', token)
          context.globalState.update('expires', now + 3600)
          context.globalState.update('refresh_key', refresh_token)
          getUser()
          checkPlaybackDevice()
          pauseMusic()
        }
      })
      .catch(err => console.error(err))
  }

  /**
   * Will check if the key pressed is backspace.
   * Call an event emitters to check time and keystroke.
   */
  const checkInput = event => {
    if (event.contentChanges[0].text === '') {
      myEmitter.emit('backspace')
    }
    myEmitter.emit('check')
    myEmitter.emit('keystroke')
  }

  /**
   * This method will decrement the counter by one every second.
   * Call an event emitter to check the time left.
   * Call the create statusbar method.
   */
  const decrementCounter = () => {
    userTotalTime++
    prevCount = counter
    if (counter !== 0) {
      counter--
    }

    myEmitter.emit('check')
    createStatusBarItem()
  }

  /**
   * Creates the status bar timer and shows time left.
   */
  const createStatusBarItem = () => {
    item.text = `${counter.toString()} seconds left`
    item.show()
  }

  /**
   * Starts to play music on Spotify
   * Calls the addMusicTime method to add one every second when music is playing.
   */
  const playMusic = () => {
    intervalId = setInterval(addMusicTime, 1000)
    const bearer = 'Bearer ' + token
    fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: {
        Authorization: bearer,
        'Content-Type': 'application/json'
      }
    })
  }

  /**
   * Pauses music on Spotify
   * Clears interval on the addMusicTheme method.
   */
  const pauseMusic = () => {
    clearInterval(intervalId)
    pauseCount++
    const bearer = 'Bearer ' + token
    fetch('https://api.spotify.com/v1/me/player/pause', {
      method: 'PUT',
      headers: {
        Authorization: bearer,
        'Content-Type': 'application/json'
      }
    })
  }

  /**
   * Adds music to the played music counter
   */
  const addMusicTime = () => {
    musicTime++
  }

  /**
   * Sends data to the backend and stores it in the database
   */
  const sendData = async () => {
    let user = context.globalState.get('user')
    let data = {
      sessionId: sessionId,
      totalTime: userTotalTime,
      musicTime: musicTime,
      pausedTimes: pauseCount,
      user: user
    }
    let res = await fetch(`${baseUrl}/extension`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })

    let sessionData = await res.json()
    sessionId = sessionData.session[0].id
  }

  checkApiKey()
  setInterval(decrementCounter, 1000)
  setInterval(sendData, 60000)
  vscode.workspace.onDidChangeTextDocument(checkInput)
  context.subscriptions.push(disposable)
}
exports.activate = activate
// this method is called when the extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate
}
