/**
 * The module 'vscode' contains the VS Code extensibility API.
 */
const vscode = require('vscode')
const fetch = require('node-fetch')
const cp = require('child_process')
const username = require('username')
require('dotenv').config()
const EventEmitter = require('events')
let disposable

/**
 * This method is called when the extension is activated.
 * The initSpotify method is called after a message is presented.
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  disposable = vscode.commands.registerCommand('extension.mpm', function() {
    vscode.window.showInformationMessage('Music Per Minute')
  })

  let stop = vscode.commands.registerCommand('extension.stop', function() {
    dispose()
  })

  class MyEmitter extends EventEmitter {}
  const myEmitter = new MyEmitter()
  const baseUrl = 'https://mpm-node-backend.herokuapp.com'
  let token = ''
  let counter = 0
  let prevCount = 0
  let userTotalTime = 0
  let pauseCount = 0
  let musicTime = 0
  let sessionId = null
  let intervalId = null
  let keypressTime = 0
  let hardMode = null
  let isPlaying = false

  /**
   * Adds one to the counter.
   */
  myEmitter.on('keystroke', () => {
    counter = counter + keypressTime
  })

  /**
   * Removes one from the counter if the counter not is on 0.
   */
  myEmitter.on('backspace', () => {
    if (hardMode === true) {
      counter = 0
    }
    if (counter !== 0) {
      counter = counter - 1
    }
  })

  /**
   * Compares the counter and the previous value.
   * Checks if it should play or pause music.
   * Calls the play or pause method.
   */
  myEmitter.on('check', () => {
    if (counter === 0 && prevCount === 0) {
      return
    } else if (counter > 0 && prevCount < counter) {
      let expires = context.globalState.get('expires')
      let now = Date.now() / 1000
      if (now > expires) {
        requestNewToken()
      } else {
        playMusic()
      }
    } else if (counter === 0 && counter < prevCount) {
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
      getUserSettings()
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
      `${baseUrl}/auth/refresh_token?refresh_token=${refreshKey}`,
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
   * Gets the user and stores the user in globalState.
   * Creates the user in the database and stores the database id in globalState.
   * This is to later be able to get the user settings.
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
      vscode.Uri.parse('https://ciavarella.dev/auth/login')
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
          getUserSettings()
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
    } else {
      myEmitter.emit('keystroke')
    }
    myEmitter.emit('check')
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
    if (counter === 0) {
      myEmitter.emit('check')
    }

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
    if (isPlaying === true) {
      return
    }
    startInterval.start()
    const bearer = 'Bearer ' + token
    fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: {
        Authorization: bearer,
        'Content-Type': 'application/json'
      }
    })
    isPlaying = true
  }

  /**
   * Pauses music on Spotify
   * Clears interval on the addMusicTheme method.
   */
  const pauseMusic = () => {
    startInterval.stop()
    pauseCount++
    const bearer = 'Bearer ' + token
    fetch('https://api.spotify.com/v1/me/player/pause', {
      method: 'PUT',
      headers: {
        Authorization: bearer,
        'Content-Type': 'application/json'
      }
    })
    isPlaying = false
  }

  /**
   * Adds or stops the played music counter
   */
  const startInterval = {
    start: () => {
      intervalId = setInterval(() => {
        musicTime++
      }, 1000)
    },
    stop: () => {
      clearInterval(intervalId)
    }
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

  /**
   * Gets the users settings by email based on the user in globalState.
   * If the user has no settings it will default to the default values.
   * */
  const getUserSettings = async () => {
    let user = context.globalState.get('user')

    if (user !== undefined) {
      let res = await fetch(`${baseUrl}/extension/settings`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          email: user.email
        }
      })
      let settings = await res.json()
      if (settings !== null) {
        context.globalState.update('keypress', settings.settings.keypress)
        context.globalState.update('hardmode', settings.settings.hardcore)
        keypressTime = settings.settings.keypress
        hardMode = settings.settings.hardcore
      } else {
        keypressTime = 1
        hardMode = false
      }
    } else {
      keypressTime = 1
      hardMode = false
    }
  }

  checkApiKey()
  setInterval(decrementCounter, 1000)
  setInterval(sendData, 60000)
  vscode.workspace.onDidChangeTextDocument(checkInput)
  context.subscriptions.push(disposable)
  context.subscriptions.push(stop)
}
exports.activate = activate

function dispose() {
  console.log('dispose')
  disposable.dispose()
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
}
