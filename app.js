const fs = require('fs');
const path = require('path');
const ExifParser = require('exif-parser');

class RegistriBattesimi {
    constructor() {
        this.currentBook = null;
        this.currentPage = 0;
        this.books = [];
        this.viewMode = 'continuous'; // 'single' o 'continuous'
        this.pageAnnotations = {};
        this._yearDialogKeyHandler = null;
        this._pageInputHandler = null;        // ← NUOVO
        this._searchInputHandler = null;      // ← NUOVO
        this.init();
    }

    async init() {
        await this.loadPageAnnotations();
        await this.loadBooks();
        this.renderBooksList();

        setTimeout(() => {
            console.log('🔄 Aggiornamento forzato della lista libri...');
            this.renderBooksList();
        }, 1000);
    }

    cleanupAllEventListeners() {
        if (this._yearDialogKeyHandler) {
            document.removeEventListener('keydown', this._yearDialogKeyHandler);
            this._yearDialogKeyHandler = null;
        }
        
        if (this._pageInputHandler) {
            const pageInput = document.getElementById('page-number');
            if (pageInput) {
                pageInput.removeEventListener('keypress', this._pageInputHandler);
            }
            this._pageInputHandler = null;
        }
        
        if (this._searchInputHandler) {
            const searchInput = document.getElementById('search-year');
            if (searchInput) {
                searchInput.removeEventListener('keypress', this._searchInputHandler);
            }
            this._searchInputHandler = null;
        }
    }

    setupInputListeners() {
        this.cleanupAllEventListeners();
        
        const pageInput = document.getElementById('page-number');
        if (pageInput) {
            this._pageInputHandler = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.goToPageFromInput();
                }
            };
            pageInput.addEventListener('keypress', this._pageInputHandler);
        }
        
        const searchInput = document.getElementById('search-year');
        if (searchInput) {
            this._searchInputHandler = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.searchBooksByYear();
                }
            };
            searchInput.addEventListener('keypress', this._searchInputHandler);
        }
    }

    showNotification(message, type = 'info') {
        const existing = document.getElementById('custom-notification');
        if (existing) existing.remove();
        
        let backgroundColor, borderColor, icon;
        switch(type) {
            case 'success': 
                backgroundColor = '#d4edda'; 
                borderColor = '#28a745'; 
                icon = '✅';
                break;
            case 'error': 
                backgroundColor = '#f8d7da'; 
                borderColor = '#dc3545'; 
                icon = '❌';
                break;
            case 'warning': 
                backgroundColor = '#fff3cd'; 
                borderColor = '#ffc107'; 
                icon = '⚠️';
                break;
            default: 
                backgroundColor = '#d1ecf1'; 
                borderColor = '#17a2b8';
                icon = 'ℹ️';
        }
        
        const notificationHtml = `
            <div id="custom-notification" style="
                position: fixed; top: 20px; right: 20px;
                background: ${backgroundColor}; 
                border: 2px solid ${borderColor};
                border-radius: 12px; 
                padding: 1rem 1.5rem;
                box-shadow: 0 6px 20px rgba(0,0,0,0.25);
                z-index: 9999; 
                max-width: 400px;
                animation: slideInRight 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.8rem;">
                        <span style="font-size: 1.5rem;">${icon}</span>
                        <span style="color: #333; font-weight: 500;">${message}</span>
                    </div>
                    <button onclick="this.parentElement.parentElement.remove()" 
                            style="background: none; border: none; font-size: 1.4rem; 
                                cursor: pointer; color: #666; transition: transform 0.2s;
                                padding: 0; line-height: 1;"
                            onmouseover="this.style.transform='scale(1.2)'"
                            onmouseout="this.style.transform='scale(1)'">✕</button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', notificationHtml);
        
        setTimeout(() => {
            const notification = document.getElementById('custom-notification');
            if (notification) {
                notification.style.animation = 'slideOutRight 0.3s ease-in';
                setTimeout(() => notification.remove(), 300);
            }
        }, 4000);
    }

    showAlert(message) {
        this.showNotification(message, 'info');
    }

    showAnnotationsDialog(annotations) {
        const existingDialog = document.getElementById('annotations-dialog');
        if (existingDialog) existingDialog.remove();
        
        let content = '';
        
        if (Object.keys(annotations).length === 0) {
            content = '<p style="color: #666; text-align: center; padding: 0.8rem; font-size: 0.85rem;">Nessuna annotazione presente.</p>';
        } else {
            const sortedYears = Object.keys(annotations).sort((a, b) => parseInt(a) - parseInt(b));
            content = '<div style="max-height: 500px; overflow-y: auto; padding: 0.3rem;">';
            
            sortedYears.forEach(year => {
                const pages = annotations[year];
                const pageRanges = this.formatPageRanges(pages);
                
                content += `
                    <div style="margin-bottom: 0.6rem; padding: 0.4rem; background: #f8f9fa; border-radius: 4px;">
                        <strong style="color: #8B4513; font-size: 0.95rem;">📅 Anno ${year}</strong>
                        <div style="margin-top: 0.2rem; color: #666; font-size: 0.8rem; line-height: 1.3;">
                            ${pages.length} pagine: ${pageRanges}
                        </div>
                    </div>
                `;
            });
            content += '</div>';
        }
        
        const dialogHtml = `
            <div id="annotations-dialog" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 10000;">
                <div style="background: white; padding: 1.5rem; border-radius: 8px; max-width: 650px; width: 90%;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <h3 style="margin-bottom: 0.8rem; color: #8B4513; border-bottom: 2px solid #8B4513; 
                        padding-bottom: 0.4rem; font-size: 1.1rem;">
                        📚 Annotazioni: ${this.currentBook.name}
                    </h3>
                    ${content}
                    <div style="text-align: center; margin-top: 1rem;">
                        <button id="close-annotations-btn" style="background: #6c757d; color: white; border: none;
                            padding: 0.5rem 1.2rem; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">✕ Chiudi</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', dialogHtml);
        
        document.getElementById('close-annotations-btn').addEventListener('click', () => {
            document.getElementById('annotations-dialog').remove();
        });
    }

    formatPageRanges(pages) {
        if (pages.length === 0) return '';
        if (pages.length === 1) return pages[0].toString();
        
        const sorted = [...pages].sort((a, b) => a - b);
        const ranges = [];
        let start = sorted[0], end = sorted[0];
        
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] === end + 1) {
                end = sorted[i];
            } else {
                ranges.push(start === end ? `${start}` : `${start}-${end}`);
                start = sorted[i];
                end = sorted[i];
            }
        }
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        return ranges.join(', ');
    }

    // Nuovo metodo: carica annotazioni
    async loadPageAnnotations() {
        try {
            const annotationsPath = path.join(__dirname, 'page-annotations.json');
            if (fs.existsSync(annotationsPath)) {
                const data = fs.readFileSync(annotationsPath, 'utf8');
                this.pageAnnotations = JSON.parse(data);
                console.log('📝 Annotazioni caricate:', this.pageAnnotations);
            } else {
                console.log('📝 File annotazioni non trovato, creando vuoto...');
                this.pageAnnotations = {};
                this.savePageAnnotations();
            }
        } catch (error) {
            console.error('Errore caricamento annotazioni:', error);
            this.pageAnnotations = {};
        }
    }

    // Salva annotazioni
    savePageAnnotations() {
        try {
            const annotationsPath = path.join(__dirname, 'page-annotations.json');
            fs.writeFileSync(annotationsPath, JSON.stringify(this.pageAnnotations, null, 2));
            console.log('💾 Annotazioni salvate');
        } catch (error) {
            console.error('Errore salvataggio annotazioni:', error);
        }
    }

    // Trova l'anno di una pagina
    getPageYear(bookId, pageIndex) {
        if (!this.pageAnnotations[bookId]) return null;
        
        for (const [year, pages] of Object.entries(this.pageAnnotations[bookId])) {
            if (pages.includes(pageIndex + 1)) { // +1 perché le pagine sono 1-based nel JSON
                return year;
            }
        }
        return null;
    }

    // Trova pagine per anno
    findPagesByYear(year) {
        if (!this.currentBook) return [];
        
        const bookId = this.currentBook.id;
        if (!this.pageAnnotations[bookId] || !this.pageAnnotations[bookId][year]) {
            return [];
        }
        
        return this.pageAnnotations[bookId][year].map(page => page - 1); // Converti a 0-based
    }

    // Aggiorna la ricerca per anno
    searchPagesByYearInCurrentBook() {
        const year = document.getElementById('search-year').value;
        if (!year) return;

        if (!this.currentBook) {
            this.showAlert('Seleziona prima un libro');
            return;
        }

        const pages = this.findPagesByYear(year);
        if (pages.length > 0) {
            this.goToPage(pages[0]); // Vai alla prima pagina dell'anno
            this.showAlert(`Trovate ${pages.length} pagine per l'anno ${year}. Prima pagina: ${pages[0] + 1}`);
        } else {
            this.showAlert(`Nessuna pagina trovata per l'anno ${year}`);
        }
    }

    addYearToCurrentPage() {
        if (!this.currentBook) {
            this.showAlert('Seleziona prima un libro');
            return;
        }
        
        // Crea un dialog personalizzato invece di prompt()
        this.showYearDialog();
    }

    showYearDialog() {
        // Pulisci eventuali dialog precedenti
        const existingDialog = document.getElementById('year-dialog');
        if (existingDialog) {
            existingDialog.remove();
        }

        // Crea il dialog HTML
        const dialogHtml = `
            <div id="year-dialog" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            ">
                <div style="
                    background: white;
                    padding: 2rem;
                    border-radius: 8px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    min-width: 300px;
                    text-align: center;
                ">
                    <h3 style="margin-bottom: 1rem; color: #8B4513;">Imposta Anno</h3>
                    <p style="margin-bottom: 1rem; color: #666;">
                        Inserisci l'anno per questa pagina (${this.currentPage + 1}) e tutte le successive:
                    </p>
                    <input type="number" id="year-input" placeholder="es. 1650" 
                        style="
                            width: 100px;
                            padding: 0.5rem;
                            border: 1px solid #ddd;
                            border-radius: 4px;
                            text-align: center;
                            font-size: 1rem;
                            margin-bottom: 1rem;
                        ">
                    <br>
                    <button id="confirm-year-btn" style="
                        background: #28a745;
                        color: white;
                        border: none;
                        padding: 0.5rem 1rem;
                        border-radius: 4px;
                        cursor: pointer;
                        margin-right: 0.5rem;
                    ">✅ Conferma</button>
                    <button id="cancel-year-btn" style="
                        background: #6c757d;
                        color: white;
                        border: none;
                        padding: 0.5rem 1rem;
                        border-radius: 4px;
                        cursor: pointer;
                    ">❌ Annulla</button>
                </div>
            </div>
        `;
        
        // Aggiungi il dialog al DOM
        document.body.insertAdjacentHTML('beforeend', dialogHtml);
        
        // Focus sull'input
        setTimeout(() => {
            const input = document.getElementById('year-input');
            const confirmBtn = document.getElementById('confirm-year-btn');
            const cancelBtn = document.getElementById('cancel-year-btn');
            
            if (input) {
                input.focus();
                input.select();
                
                // IMPORTANTE: Usa addEventListener invece di onclick inline
                if (confirmBtn) {
                    confirmBtn.addEventListener('click', () => this.processYearInput());
                }
                
                if (cancelBtn) {
                    cancelBtn.addEventListener('click', () => this.closeYearDialog());
                }
                
                // Gestione tasti - SALVA il riferimento per poterlo rimuovere
                this._yearDialogKeyHandler = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.processYearInput();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        this.closeYearDialog();
                    }
                };
                
                document.addEventListener('keydown', this._yearDialogKeyHandler);
                
                console.log('✅ Dialog anni configurato');
            }
        }, 150);
    }

    processYearInput() {
        const input = document.getElementById('year-input');
        const year = input ? input.value : '';
        
        if (!year || !/^\d{4}$/.test(year)) {
            this.showAlert('Inserisci un anno valido (es: 1650)');
            return;
        }
        
        this.closeYearDialog();
        this.setYearFromCurrentPage(year);
    }

    closeYearDialog() {
        // RIMUOVI l'event listener prima di chiudere il dialog
        if (this._yearDialogKeyHandler) {
            document.removeEventListener('keydown', this._yearDialogKeyHandler);
            this._yearDialogKeyHandler = null;
            console.log('🧹 Event listener rimosso');
        }
        
        const dialog = document.getElementById('year-dialog');
        if (dialog) {
            dialog.remove();
        }
    }

    setYearFromCurrentPage(year) {
        const bookId = this.currentBook.id;
        const startPageNum = this.currentPage + 1; // Converti a 1-based
        const totalPages = this.currentBook.totalPages;
        
        // Inizializza se non esiste
        if (!this.pageAnnotations[bookId]) {
            this.pageAnnotations[bookId] = {};
        }
        
        // Rimuovi le pagine dalla pagina corrente in poi da tutti gli altri anni
        for (const [existingYear, pages] of Object.entries(this.pageAnnotations[bookId])) {
            this.pageAnnotations[bookId][existingYear] = pages.filter(page => page < startPageNum);
            // Rimuovi anni vuoti
            if (this.pageAnnotations[bookId][existingYear].length === 0) {
                delete this.pageAnnotations[bookId][existingYear];
            }
        }
        
        // Crea l'array per il nuovo anno se non esiste
        if (!this.pageAnnotations[bookId][year]) {
            this.pageAnnotations[bookId][year] = [];
        }
        
        // Aggiungi tutte le pagine dalla corrente alla fine
        for (let pageNum = startPageNum; pageNum <= totalPages; pageNum++) {
            if (!this.pageAnnotations[bookId][year].includes(pageNum)) {
                this.pageAnnotations[bookId][year].push(pageNum);
            }
        }
        
        // Ordina le pagine
        this.pageAnnotations[bookId][year].sort((a, b) => a - b);
        
        this.savePageAnnotations();
        this.renderBookViewer(); // Aggiorna la vista
        
        const pagesCount = totalPages - startPageNum + 1;
        this.showAlert(`Anno ${year} impostato per ${pagesCount} pagine (dalla ${startPageNum} alla ${totalPages})`);
    }

    /*
    // SOSTITUISCI ANCHE GLI alert() CON QUESTO METODO:
    showAlert(message) {
        // Rimuovi eventuali alert precedenti
        const existingAlert = document.getElementById('custom-alert');
        if (existingAlert) {
            existingAlert.remove();
        }
        
        const alertHtml = `
            <div id="custom-alert" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10001;
            ">
                <div style="
                    background: white;
                    padding: 1.5rem;
                    border-radius: 8px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    max-width: 400px;
                    text-align: center;
                ">
                    <p style="margin-bottom: 1rem; color: #333;">${message}</p>
                    <button onclick="app.closeAlert()" style="
                        background: #8B4513;
                        color: white;
                        border: none;
                        padding: 0.5rem 1rem;
                        border-radius: 4px;
                        cursor: pointer;
                    ">OK</button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', alertHtml);

        // NUOVO: Gestisci il tasto Invio e altri eventi
        const alertDiv = document.getElementById('custom-alert');
        const alertContent = document.getElementById('alert-content');
        const okButton = document.getElementById('alert-ok-btn');
        
        if (alertDiv && okButton) {
            // Focus automatico sul bottone OK
            setTimeout(() => {
                okButton.focus();
            }, 100);
            
            // CORREZIONE: Ferma la propagazione degli eventi
            const keyHandler = (e) => {
                // IMPORTANTE: Ferma la propagazione per evitare che l'evento arrivi all'input sottostante
                e.stopPropagation();
                e.preventDefault();
                
                if (e.key === 'Enter' || e.key === 'Escape') {
                    console.log('🔑 Tasto premuto nel popup:', e.key);
                    this.closeAlert();
                    document.removeEventListener('keydown', keyHandler);
                }
            };
            
            // Aggiungi l'event listener con capture=true per intercettare prima
            document.addEventListener('keydown', keyHandler, true);
            
            // Ferma la propagazione anche sui clic dentro al contenuto del popup
            alertContent.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            
            // Chiudi cliccando fuori dal dialog (ma non dentro)
            alertDiv.addEventListener('click', (e) => {
                if (e.target === alertDiv) {
                    this.closeAlert();
                }
            });
            
            console.log('✅ Alert mostrato con propagazione bloccata');
        }
    }*/

    closeAlert() {
        const alert = document.getElementById('custom-alert');
        if (alert) {
            alert.remove();
            console.log('✅ Alert chiuso');
            
            // Rimuovi il focus da eventuali elementi per evitare conflitti
            if (document.activeElement) {
                document.activeElement.blur();
            }
            
            // Ripristina il focus dopo un piccolo delay
            setTimeout(() => {
                const searchInput = document.getElementById('search-year');
                if (searchInput && !document.getElementById('year-dialog')) {
                    searchInput.focus();
                    console.log('🎯 Focus ripristinato su search input');
                }
            }, 200);
        }
    }

    // Metodo per mostrare le annotazioni correnti (utile per debug)
    showCurrentAnnotations() {
        if (!this.currentBook) {
            this.showNotification('Seleziona prima un libro', 'warning');
            return;
        }
        
        const bookId = this.currentBook.id;
        const annotations = this.pageAnnotations[bookId] || {};
        
        this.showAnnotationsDialog(annotations);
    }

    // Carica tutti i libri dalla cartella images
    async loadBooks() {
        try {
            const imagesPath = path.join(__dirname, 'images');
            const folders = fs.readdirSync(imagesPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            this.books = [];
            
            for (const folder of folders) {
                const folderPath = path.join(imagesPath, folder);
                const files = fs.readdirSync(folderPath)
                    .filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file));

                if (files.length > 0) {
                    console.log(`📚 Analizzando metadati per ${folder}...`);
                    
                    // Leggi metadati EXIF di ogni file
                    const filesWithExif = [];
                    
                    for (const file of files) {
                        const filePath = path.join(folderPath, file);
                        let dateTimeTaken = null;
                        
                        try {
                            const buffer = fs.readFileSync(filePath);
                            const parser = ExifParser.create(buffer);
                            const result = parser.parse();
                            
                            // Cerca la data di scatto nei metadati EXIF
                            if (result.tags && result.tags.DateTime) {
                                dateTimeTaken = new Date(result.tags.DateTime * 1000);
                            } else if (result.tags && result.tags.DateTimeOriginal) {
                                dateTimeTaken = new Date(result.tags.DateTimeOriginal * 1000);
                            } else if (result.tags && result.tags.DateTimeDigitized) {
                                dateTimeTaken = new Date(result.tags.DateTimeDigitized * 1000);
                            }
                            
                            console.log(`📸 ${file}: ${dateTimeTaken ? dateTimeTaken.toLocaleString('it-IT') : 'Data EXIF non trovata'}`);
                            
                        } catch (exifError) {
                            console.log(`⚠️ ${file}: Errore lettura EXIF, uso data file`);
                            // Fallback alla data del file
                            const stats = fs.statSync(filePath);
                            dateTimeTaken = stats.birthtime || stats.mtime;
                        }
                        
                        filesWithExif.push({
                            name: file,
                            dateTaken: dateTimeTaken || new Date(0)
                        });
                    }
                    
                    // Ordina per data di scatto EXIF
                    const sortedImages = filesWithExif
                        .sort((a, b) => a.dateTaken - b.dateTaken)
                        .map(file => file.name);

                    console.log(`✅ Ordine finale basato su EXIF:`, sortedImages);

                    const yearMatch = folder.match(/(\d{4})/g);
                    const startYear = yearMatch ? yearMatch[0] : 'N/A';
                    const endYear = yearMatch && yearMatch[1] ? yearMatch[1] : startYear;

                    const hasDoublePages = /^[2-9]\./i.test(folder) || folder.includes('Registro2');
                    // Calcola le pagine
                    let totalPages;
                    if (hasDoublePages) {
                        totalPages = this.calculateDoublePagesCount(sortedImages.length);
                    } else {
                        // Per il primo libro, sottrai 1 (copertina non conta)
                        const isFirstBook = this.books.length === 0; // È il primo se l'array è ancora vuoto
                        totalPages = isFirstBook ? sortedImages.length - 1 : sortedImages.length;
                    }

                    this.books.push({
                        id: folder,
                        name: folder.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                        folder: folder,
                        images: sortedImages,
                        startYear: parseInt(startYear),
                        endYear: parseInt(endYear),
                        totalPages: totalPages,
                        hasDoublePages: hasDoublePages
                    });
                }
            }

            this.books.sort((a, b) => a.startYear - b.startYear);

            console.log('📚 Libri caricati:', this.books);
            this.renderBooksList();
            
        } catch (error) {
            console.error('Errore nel caricamento dei libri:', error);
        }
    }

    calculateDoublePagesCount(photoCount) {
        if (photoCount === 0) return 0;
        if (photoCount === 1) return 1;
        if (photoCount === 2) return 2;
        const middlePhotos = photoCount - 3;
        return 1 + 1 + (middlePhotos * 2) + 1;
    }

    getPageNumbersFromPhotoIndex(photoIndex, book) {
        const isFirstBook = this.books.indexOf(book) === 0;
    
        if (!book.hasDoublePages) {
            if (isFirstBook && photoIndex === 0) {
                return ['Copertina']; // Prima foto = Copertina
            }
            if (isFirstBook) {
                return [photoIndex]; // Le altre foto partono da 1
            }
            return [photoIndex + 1];
        }
        
        const totalPhotos = book.images.length;
        if (photoIndex === 0) return [1];
        if (photoIndex === 1) return [2];
        if (photoIndex === totalPhotos - 1) {
            return [this.calculateDoublePagesCount(totalPhotos)];
        }
        
        const middlePhotoIndex = photoIndex - 2;
        const firstPage = 3 + (middlePhotoIndex * 2);
        return [firstPage, firstPage + 1];
    }

    getPhotoIndexFromPageNumber(pageNumber, book) {
        const isFirstBook = this.books.indexOf(book) === 0;
    
        if (!book.hasDoublePages) {
            if (isFirstBook) {
                return pageNumber; // Foto 1 = Pagina 1
            }
            return pageNumber - 1;
        }
        
        const totalPhotos = book.images.length;
        if (pageNumber === 1) return 0;
        if (pageNumber === 2) return 1;
        
        const lastPage = this.calculateDoublePagesCount(totalPhotos);
        if (pageNumber === lastPage) return totalPhotos - 1;
        
        const middlePage = pageNumber - 3;
        return 2 + Math.floor(middlePage / 2);
    }

    getBookYearRange(bookId) {
        console.log('🔍 Cercando anni per libro:', bookId);
        console.log('📝 Annotazioni disponibili:', this.pageAnnotations);
        
        // Controlla se ci sono annotazioni per questo libro
        if (!this.pageAnnotations[bookId]) {
            console.log('❌ Nessuna annotazione trovata per:', bookId);
            return null;
        }
        
        const years = Object.keys(this.pageAnnotations[bookId]).map(year => parseInt(year));
        console.log('📅 Anni trovati:', years);
        
        if (years.length === 0) {
            return null;
        }
        
        // Trova anno minimo e massimo
        const minYear = Math.min(...years);
        const maxYear = Math.max(...years);
        
        console.log(`✅ Range calcolato per ${bookId}: ${minYear}-${maxYear} (${years.length} anni)`);
        
        return {
            start: minYear,
            end: maxYear,
            totalYears: years.length
        };
    }

    getBookYearRangeDisplay() {
        if (!this.currentBook) return '';
        
        const yearRange = this.getBookYearRange(this.currentBook.id);
        
        if (yearRange) {
            if (yearRange.start === yearRange.end) {
                return `<span style="color: #666; font-size: 0.9em;">(${yearRange.start})</span>`;
            } else {
                return `<span style="color: #666; font-size: 0.9em;">(${yearRange.start}-${yearRange.end})</span>`;
            }
        }
        
        return '';
    }

    renderBooksList() {
        const booksList = document.getElementById('books-list');
        if (!booksList) return;

        let html = '';
        this.books.forEach((book, index) => {
            console.log(`🔧 Processando libro: ${book.name} (ID: ${book.id})`);
            
            // USA LE ANNOTAZIONI per gli anni
            const annotationYears = this.getBookYearRange(book.id);
            
            let yearInfo = '';
            
            if (annotationYears) {
                // Usa gli anni dalle annotazioni (più precisi)
                if (annotationYears.start === annotationYears.end) {
                    yearInfo = `(${annotationYears.start} - ${annotationYears.totalYears} anno)`;
                } else {
                    yearInfo = `(${annotationYears.start}-${annotationYears.end} - ${annotationYears.totalYears} anni)`;
                }
                console.log(`✅ ${book.name}: anni da annotazioni ${yearInfo}`);
            } else if (book.startYear) {
                // Fallback: usa gli anni dal nome della cartella
                yearInfo = book.endYear && book.endYear !== book.startYear ? 
                    `(${book.startYear}-${book.endYear} da cartella)` : 
                    `(${book.startYear} da cartella)`;
                console.log(`⚠️ ${book.name}: anni da cartella ${yearInfo}`);
            } else {
                yearInfo = '(anni non definiti)';
                console.log(`❌ ${book.name}: nessun anno disponibile`);
            }
            
            html += `
                <div class="book-item" onclick="app.selectBook(app.books[${index}])">
                    <div class="book-title">${book.name}</div>
                    <div class="book-info">${yearInfo} ${yearInfo && book.totalPages ? '·' : ''} ${book.totalPages} pagine</div>
                </div>
            `;
        });

        booksList.innerHTML = html;
        console.log('📚 Lista libri completata');
    }

    // Seleziona un libro
    selectBook(book) {
        console.log('📖 Selezionando libro:', book);

        this.cleanupAllEventListeners();
        this.currentBook = book;
        this.currentPage = 0;
        this.renderBookViewer();
        
        // CORREZIONE: Verifica che gli elementi esistano prima di modificarli
        const bookItems = document.querySelectorAll('.book-item');
        console.log('📚 Elementi book-item trovati:', bookItems.length);
        
        bookItems.forEach((item, index) => {
            if (item && item.classList) { // Verifica che l'elemento e classList esistano
                if (this.books[index] === book) {
                    item.classList.add('active');
                    console.log('✅ Libro attivato:', this.books[index].name);
                } else {
                    item.classList.remove('active');
                }
            }
        });
    }

    // Renderizza il visualizzatore del libro
    renderBookViewer() {
        const bookViewer = document.getElementById('book-viewer');
        
        if (!this.currentBook) {
            bookViewer.innerHTML = '<p>Seleziona un libro dalla lista per iniziare</p>';
            return;
        }

        const currentImage = this.currentBook.images[this.currentPage];
        const imagePath = `images/${this.currentBook.folder}/${currentImage}`;
        
        bookViewer.innerHTML = `
            <div class="page-viewer">
                <h2>${this.currentBook.name}</h2>
                
                <div class="page-navigation">
                    <button class="nav-button" onclick="app.previousPage()" ${this.currentPage === 0 ? 'disabled' : ''}>
                        ← Precedente
                    </button>
                    
                    <span class="page-info">
                        Pagina ${this.currentPage + 1} di ${this.currentBook.totalPages}
                    </span>
                    
                    <button class="nav-button" onclick="app.nextPage()" ${this.currentPage === this.currentBook.totalPages - 1 ? 'disabled' : ''}>
                        Successiva →
                    </button>
                </div>
                
                <div class="image-container">
                    <img src="${imagePath}" class="page-image" alt="Pagina ${this.currentPage + 1}" onclick="app.zoomImage(this)">
                </div>
                
                <div class="page-info">
                    <small>File: ${currentImage}</small>
                </div>
            </div>
        `;
    }

    // Vai a una pagina specifica
    goToPage(photoIndex) {
        if (!this.currentBook) return;

        const index = parseInt(photoIndex);
        
        // Verifica che l'indice sia valido (indice FOTO, non pagina!)
        if (index < 0 || index >= this.currentBook.images.length) {
            this.showNotification('Foto non valida', 'error');
            return;
        }

        this.currentPage = index;
        this.renderBookViewer();
    }

    // Vai a pagina da input numerico
    goToPageFromInput() {
        const input = document.getElementById('page-input');
        if (!input || !this.currentBook) return;

        const pageNumber = parseInt(input.value);
        
        if (isNaN(pageNumber) || pageNumber < 1 || pageNumber > this.currentBook.totalPages) {
            this.showNotification(`Inserisci una pagina tra 1 e ${this.currentBook.totalPages}`, 'error');
            return;
        }

        // Converti numero pagina in indice foto
        const photoIndex = this.getPhotoIndexFromPageNumber(pageNumber, this.currentBook);
        this.goToPage(photoIndex);
    }

    // Aggiorna anche i metodi previousPage e nextPage per aggiornare il selettore
    previousPage() {
        if (this.currentPage > 0) {
            this.currentPage--;
            this.renderBookViewer();
        }
    }

    nextPage() {
        if (this.currentPage < this.currentBook.totalPages - 1) {
            this.currentPage++;
            this.renderBookViewer();
        }
    }

    // Nuovo metodo per cambiare modalità di visualizzazione
    toggleViewMode() {
        this.viewMode = this.viewMode === 'single' ? 'continuous' : 'single';
        this.renderBookViewer();
        
        // Aggiorna l'icona del bottone
        const toggleBtn = document.getElementById('view-toggle');
        if (toggleBtn) {
            toggleBtn.innerHTML = this.viewMode === 'single' 
                ? '📄→📋 Vista Continua' 
                : '📋→📄 Vista Singola';
        }
    }

    // Renderizza il visualizzatore del libro (SOSTITUISCI il metodo esistente)
    renderBookViewer() {
        const bookViewer = document.getElementById('book-viewer');
        
        if (!this.currentBook) {
            bookViewer.innerHTML = '<p>Seleziona un libro dalla lista per iniziare</p>';
            return;
        }

        if (this.viewMode === 'single') {
            this.renderSinglePageView(bookViewer);
        } else {
            this.renderContinuousView(bookViewer);
        }
    }

    renderSinglePageView(container) {
        const currentImage = this.currentBook.images[this.currentPage];
        const imagePath = `images/${this.currentBook.folder}/${currentImage}`;
        
        // Ottieni i numeri di pagina per questa foto
        const pageNumbers = this.getPageNumbersFromPhotoIndex(this.currentPage, this.currentBook);
        const pageDisplay = pageNumbers.length === 1 ? 
            `Pagina ${pageNumbers[0]}` : 
            `Pagine ${pageNumbers[0]}-${pageNumbers[1]}`;
        
        const currentYear = this.getPageYear(this.currentBook.id, this.currentPage);

        // Genera le opzioni per il selettore di foto
        let pageOptions = '';
        for (let i = 0; i < this.currentBook.images.length; i++) {
            const selected = i === this.currentPage ? 'selected' : '';
            const nums = this.getPageNumbersFromPhotoIndex(i, this.currentBook);
            const label = nums.length === 1 ? `Pag. ${nums[0]}` : `Pag. ${nums[0]}-${nums[1]}`;
            pageOptions += `<option value="${i}" ${selected}>${label}</option>`;
        }

        container.innerHTML = `
            <div class="page-viewer">
                <div class="viewer-controls">
                    <h2>${this.currentBook.name} ${this.getBookYearRangeDisplay()}</h2>
                    <div class="control-buttons">
                        <button onclick="app.addYearToCurrentPage()" class="year-btn">
                            📅 Imposta Anno (da qui in poi)
                        </button>
                        <button onclick="app.showCurrentAnnotations()" class="info-btn">
                            ℹ️ Vedi Annotazioni
                        </button>
                        <button id="view-toggle" onclick="app.toggleViewMode()" class="view-toggle-btn">
                            📄→📋 Vista Continua
                        </button>
                    </div>
                </div>
                
                <div class="page-navigation-compact">
                    <button class="nav-button" onclick="app.goToPage(0)" ${this.currentPage === 0 ? 'disabled' : ''}>
                        ⏮️
                    </button>
                    
                    <button class="nav-button" onclick="app.previousPage()" ${this.currentPage === 0 ? 'disabled' : ''}>
                        ← Prec
                    </button>
                    
                    <div class="page-selector-compact">
                        <select id="page-select" onchange="app.goToPage(this.value)" class="page-select-compact">
                            ${pageOptions}
                        </select>
                        <span class="page-total">/${this.currentBook.totalPages} pagine</span>
                    </div>

                    <input type="number" id="page-input" min="1" max="${this.currentBook.totalPages}" 
                        value="${pageNumbers[0]}" onchange="app.goToPageFromInput()" 
                        onkeypress="app.handlePageInputEnter(event)"
                        placeholder="#" class="page-input-compact" title="Digita numero pagina e premi Invio">
                    
                    <button class="nav-button" onclick="app.nextPage()" ${this.currentPage === this.currentBook.images.length - 1 ? 'disabled' : ''}>
                        Succ →
                    </button>
                    
                    <button class="nav-button" onclick="app.goToPage(${this.currentBook.images.length - 1})" 
                            ${this.currentPage === this.currentBook.images.length - 1 ? 'disabled' : ''}>
                        ⏭️
                    </button>
                </div>
                
                <div class="image-container single-view">
                    <img src="${imagePath}" class="page-image" alt="${pageDisplay}" onclick="app.zoomImage(this)">
                </div>
                
                <div class="page-info">
                    <small>File: ${currentImage}</small>
                    ${currentYear ? `<br><strong>📅 Anno: ${currentYear}</strong>` : ''}
                </div>
            </div>
        `;

        setTimeout(() => this.setupInputListeners(), 100);
    }

    renderContinuousView(container) {
        let imagesHtml = '';
        
        this.currentBook.images.forEach((image, index) => {
            const imagePath = `images/${this.currentBook.folder}/${image}`;
            
            // Ottieni i numeri di pagina per questa foto
            const pageNumbers = this.getPageNumbersFromPhotoIndex(index, this.currentBook);
            const pageDisplay = pageNumbers.length === 1 ? 
                `Pagina ${pageNumbers[0]}` : 
                `Pagine ${pageNumbers[0]}-${pageNumbers[1]}`;
            
            const year = this.getPageYear(this.currentBook.id, index);
            const yearDisplay = year ? `<span class="page-year">📅 ${year}</span>` : '';
            
            imagesHtml += `
                <div class="continuous-page" data-page="${index}">
                    <div class="page-header">
                        <span class="page-number">${pageDisplay}</span>
                        ${yearDisplay}
                        <span class="page-filename">${image}</span>
                    </div>
                    <img src="${imagePath}" class="continuous-image" alt="${pageDisplay}" 
                        onclick="app.zoomImage(this)" loading="lazy">
                </div>
            `;
        });

        container.innerHTML = `
            <div class="continuous-viewer">
                <div class="viewer-controls">
                    <h2>${this.currentBook.name} ${this.getBookYearRangeDisplay()}</h2>
                    <button id="view-toggle" onclick="app.toggleViewMode()" class="view-toggle-btn">
                        📋→📄 Vista Singola
                    </button>
                </div>
                
                <div class="continuous-info">
                    <div class="info-left">
                        <p>📖 Tutte le ${this.currentBook.totalPages} pagine - Scorri per navigare</p>
                    </div>
                    <div class="info-controls">
                        <button onclick="app.changeImageSize('small')" class="size-btn">🔍- Piccole</button>
                        <button onclick="app.changeImageSize('medium')" class="size-btn">🔍 Medie</button>
                        <button onclick="app.changeImageSize('large')" class="size-btn">🔍+ Grandi</button>
                        <button onclick="app.scrollToTop()" class="scroll-btn">⬆️ Inizio</button>
                        <button onclick="app.scrollToBottom()" class="scroll-btn">⬇️ Ultima pagina caricata</button>
                    </div>
                </div>
                
                <div class="continuous-container" id="continuous-container">
                    ${imagesHtml}
                </div>
            </div>
        `;

        // Scroll automatico alla pagina corrente
        setTimeout(() => {
            this.scrollToPage(this.currentPage);
        }, 100);

        setTimeout(() => this.setupInputListeners(), 100);
    }

    // Nuovi metodi di utilità
    scrollToPage(pageIndex) {
        const pageElement = document.querySelector(`[data-page="${pageIndex}"]`);
        if (pageElement) {
            pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // Gestisce il tasto Invio nell'input
    handlePageInputEnter(event) {
        if (event.key === 'Enter') {
            this.goToPageFromInput();
        }
    }

    scrollToTop() {
        const container = document.getElementById('continuous-container');
        if (container) {
            container.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    scrollToBottom() {
        const container = document.getElementById('continuous-container');
        if (container) {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        }
    }

    // Aggiorna il metodo di zoom per gestire entrambe le modalità
    zoomImage(img) {
        if (img.style.transform === 'scale(1.5)') {
            img.style.transform = 'scale(1)';
            img.style.cursor = 'zoom-in';
            img.style.zIndex = 'auto';
        } else {
            img.style.transform = 'scale(1.5)';
            img.style.cursor = 'zoom-out';
            img.style.zIndex = '1000';
            img.style.position = 'relative';
        }
    }

    // Nuovo metodo per cambiare dimensione immagini
    changeImageSize(size) {
        const images = document.querySelectorAll('.continuous-image');
        images.forEach(img => {
            // Rimuovi classi esistenti
            img.classList.remove('small', 'medium', 'large');
            
            // Applica la nuova dimensione
            if (size === 'small') {
                img.style.width = '50%';
                img.style.maxWidth = '400px';
            } else if (size === 'medium') {
                img.style.width = '70%';
                img.style.maxWidth = '500px';
            } else { // large
                img.style.width = '90%';
                img.style.maxWidth = '800px';
            }
        });
    }

    searchBooksByYear() {
        const yearInput = document.getElementById('search-year');
        const year = yearInput ? yearInput.value : '';
        
        if (!year) {
            this.showAlert('Inserisci un anno da cercare');
            return;
        }

        const searchYear = parseInt(year);
        
        if (isNaN(searchYear)) {
            this.showAlert('Inserisci un anno valido (es: 1650)');
            return;
        }
        
        // CORREZIONE: Cerca prima nei libri per anno di cartella
        let foundBook = this.books.find(book => 
            book.startYear && searchYear >= book.startYear && searchYear <= book.endYear
        );
        
        // Se non trova nei nomi delle cartelle, cerca nelle annotazioni delle pagine
        if (!foundBook) {
            for (const book of this.books) {
                if (this.pageAnnotations[book.id] && this.pageAnnotations[book.id][year]) {
                    foundBook = book;
                    break;
                }
            }
        }

        if (foundBook) {
            this.selectBook(foundBook);
            
            const bookItems = document.querySelectorAll('.book-item');
            bookItems.forEach((item, index) => {
                if (this.books[index] === foundBook) {
                    item.scrollIntoView({ behavior: 'smooth' });
                    item.classList.add('active');
                }
            });
            
            // Se l'anno è nelle annotazioni, vai alla prima pagina di quell'anno
            if (this.pageAnnotations[foundBook.id] && this.pageAnnotations[foundBook.id][year]) {
                const pages = this.pageAnnotations[foundBook.id][year];
                const firstPageIndex = pages[0] - 1; // Converti a 0-based
                this.goToPage(firstPageIndex);
                this.showAlert(`Libro trovato: ${foundBook.name}. Andando alla prima pagina dell'anno ${year} (pagina ${pages[0]})`);
            } else {
                this.showAlert(`Libro trovato: ${foundBook.name}`);
            }
            
        } else {
            this.showAlert(`Nessun libro trovato per l'anno ${year}`);
            
            if (yearInput) {
                yearInput.value = '';
                yearInput.focus();
            }
        }
    }

    // AGGIUNGI QUESTO NUOVO METODO per gestire il tasto Invio:
/*
    setupSearchInput() {
        const searchInput = document.getElementById('search-year');
        if (searchInput) {
            // Rimuovi eventuali listener precedenti
            searchInput.removeEventListener('keypress', this.handleSearchEnter);
            
            // Aggiungi il nuovo listener
            this.handleSearchEnter = (event) => {
                if (event.key === 'Enter') {
                    this.searchBooksByYear();
                }
            };
            
            searchInput.addEventListener('keypress', this.handleSearchEnter);
            
            // Aggiungi anche un listener per l'input per debug
            searchInput.addEventListener('input', (event) => {
                console.log('Input cambiato:', event.target.value);
            });
        }
    }*/

    cleanupEventListeners() {
        // Pulisci tutti gli event listener sull'input di ricerca
        const searchInput = document.getElementById('search-year');
        if (searchInput) {
            const newInput = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(newInput, searchInput);
            console.log('🧹 Event listener puliti');
        }
    }

    forceUpdateBooksList() {
        console.log('🔄 Forzando aggiornamento lista libri...');
        this.renderBooksList();
    }
    
}

function setUserInfo() {
    console.log('🔐 Impostazione info utente...');
    
    const userInfo = document.getElementById('user-info');
    
    if (userInfo) {
        userInfo.textContent = '✅ Accesso autorizzato';
        console.log('✅ Info utente impostata');
    } else {
        console.error('❌ Elemento user-info non trovato!');
    }
}

// CORREZIONE: Funzione globale per la ricerca
function searchByYear() {
    console.log('🔍 searchByYear chiamata, app:', window.app);
    if (window.app && window.app.searchBooksByYear) {
        window.app.searchBooksByYear();
    } else {
        console.error('❌ App non inizializzata o metodo mancante');
        alert('App non ancora caricata, riprova tra un secondo');
    }
}

// INIZIALIZZAZIONE CORRETTA
window.app = null;

console.log('📦 Script app.js caricato');

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOMContentLoaded - Inizializzazione...');
    
    setUserInfo();
    
    try {
        window.app = new RegistriBattesimi();
        console.log('✅ App creata:', window.app);
        
        // Verifica che i metodi esistano
        if (window.app.searchBooksByYear) {
            console.log('✅ searchBooksByYear OK');
        }
        if (window.app.addYearToCurrentPage) {
            console.log('✅ addYearToCurrentPage OK');
        }
        
    } catch (error) {
        console.error('❌ Errore creazione app:', error);
    }
});

// Fallback se DOMContentLoaded non funziona
setTimeout(() => {
    if (!window.app) {
        console.log('🔄 Fallback: Creazione app ritardata...');
        try {
            window.app = new RegistriBattesimi();
            console.log('✅ App creata via fallback');
        } catch (error) {
            console.error('❌ Errore fallback:', error);
        }
    }
}, 2000);