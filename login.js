const { ipcRenderer } = require('electron');

class LoginManager {
    constructor() {
        this.init();
    }

    init() {
        const form = document.getElementById('login-form');
        const usernameSelect = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const loginBtn = document.getElementById('login-btn');
        const errorMessage = document.getElementById('error-message');

        // Focus automatico sul primo campo
        usernameSelect.focus();

        // Gestione submit del form
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });

        // Gestione tasto Enter
        passwordInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                await this.handleLogin();
            }
        });

        // Nascondi errore quando l'utente inizia a digitare
        usernameSelect.addEventListener('change', () => {
            this.hideError();
        });

        passwordInput.addEventListener('input', () => {
            this.hideError();
        });
    }

    async handleLogin() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const loginBtn = document.getElementById('login-btn');

        // Validazione lato client
        if (!username) {
            this.showError('Seleziona un nome utente');
            return;
        }

        if (!password) {
            this.showError('Inserisci la password');
            return;
        }

        if (password.length < 6) {
            this.showError('La password deve essere di almeno 6 caratteri');
            return;
        }

        // Mostra stato di caricamento
        this.setLoading(true);

        try {
            // Invia richiesta di login al processo principale
            const result = await ipcRenderer.invoke('login-attempt', username, password);

            if (result.success) {
                // Login riuscito - la finestra principale si aprirà automaticamente
                this.showSuccess(`Benvenuto, ${this.getUserDisplayName(result.user)}!`);
            } else {
                // Login fallito
                this.showError(result.message || 'Credenziali non valide');
                this.setLoading(false);
                // Pulisci il campo password
                document.getElementById('password').value = '';
                document.getElementById('password').focus();
            }
        } catch (error) {
            console.error('Errore durante il login:', error);
            this.showError('Errore di sistema. Riprova.');
            this.setLoading(false);
        }
    }

    showError(message) {
        const errorDiv = document.getElementById('error-message');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        errorDiv.style.background = '#f8d7da';
        errorDiv.style.color = '#721c24';
        
        // Shake animation
        errorDiv.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => {
            errorDiv.style.animation = '';
        }, 500);
    }

    showSuccess(message) {
        const errorDiv = document.getElementById('error-message');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        errorDiv.style.background = '#d4edda';
        errorDiv.style.color = '#155724';
    }

    hideError() {
        const errorDiv = document.getElementById('error-message');
        errorDiv.style.display = 'none';
    }

    setLoading(isLoading) {
        const loginBtn = document.getElementById('login-btn');
        const form = document.getElementById('login-form');
        
        if (isLoading) {
            loginBtn.disabled = true;
            loginBtn.textContent = 'Accesso in corso...';
            loginBtn.classList.add('loading');
            form.style.pointerEvents = 'none';
        } else {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Accedi';
            loginBtn.classList.remove('loading');
            form.style.pointerEvents = 'auto';
        }
    }

    getUserDisplayName(username) {
        const displayNames = {
            'don.adro': 'Don Adro'
        };
        return displayNames[username] || username;
    }
}

// Aggiungi animazione shake al CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translateX(5px); }
    }
`;
document.head.appendChild(style);

// Inizializza il login manager quando la pagina è caricata
document.addEventListener('DOMContentLoaded', () => {
    new LoginManager();
});

// Gestione chiusura finestra con Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const { remote } = require('electron');
        if (remote) {
            remote.getCurrentWindow().close();
        }
    }
});