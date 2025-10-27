const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

let mainWindow
let loginWindow

// Credenziali (in produzione potresti crittografarle)
const CREDENTIALS = {
    'don.adro': 'Registri2025!',
}

function createLoginWindow() {
    loginWindow = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        resizable: true,         // Cambiato da false
        minimizable: true,       // Aggiunto
        maximizable: false,      // Mantieni false per il login
        title: 'Accesso - Registri Battesimi',
        show: false,
        frame: true,
        icon: path.join(__dirname, 'chiesa.ico')
    })

    loginWindow.loadFile('login.html')
    
    loginWindow.once('ready-to-show', () => {
        loginWindow.maximize()
        loginWindow.show()
    })

    loginWindow.on('closed', () => {
        loginWindow = null
        if (!mainWindow) {
            app.quit()
        }
    })
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        title: 'Registri Battesimi - Parrocchia',
        show: false,
        resizable: true,         // Assicurati che sia true
        minimizable: true,
        maximizable: true,
        icon: path.join(__dirname, 'chiesa.ico')
    })

    mainWindow.loadFile('index.html')
    
    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize()
        mainWindow.show()
        //mainWindow.webContents.openDevTools() // DA COMMENTARE ALLA FINE DEI TEST
        if (loginWindow) {
            loginWindow.close()
        }
    })

    mainWindow.on('closed', () => {
        mainWindow = null
    })
}

// Gestisce il tentativo di login
ipcMain.handle('login-attempt', async (event, username, password) => {
    if (CREDENTIALS[username] && CREDENTIALS[username] === password) {
        // Login riuscito
        createMainWindow()
        return { success: true, user: username }
    } else {
        // Login fallito
        return { success: false, message: 'Credenziali non valide' }
    }
})

app.whenReady().then(() => {
    createLoginWindow()
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createLoginWindow()
    }
})