const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');

const app = express();

// --- 1. AYARLAR ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

// --- 2. DOSYA YÜKLEME AYARLARI ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './public/images/');
    },
    filename: function (req, file, cb) {
        cb(null, 'profil-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- 3. VERİTABANI BAĞLANTISI (İNTERNET/CLOUD) ---
// BURADAKİ BİLGİLERİ CLEVER CLOUD PANELİNDEN ALIP YAPIŞTIR
const db = mysql.createConnection({
    host: 'BURAYA_HOST_YAZ',           // Örn: uys...clever-cloud.com
    user: 'BURAYA_USER_YAZ',           // Örn: uqh2...
    password: 'BURAYA_PASSWORD_YAZ',   // Örn: H2s... (Panelde gizliyse 'göz' ikonuna bas)
    database: 'BURAYA_DATABASE_YAZ',   // Örn: be9... (Database Name)
    multipleStatements: true
});

db.connect((err) => {
    if (err) { 
        console.error('❌ Bağlantı Hatası!', err.message); 
        return; 
    }
    console.log('✅ İnternet Veritabanına (Cloud) Bağlandı!');
    
    // --- TABLOLARI OTOMATİK OLUŞTUR ---
    // Clever Cloud veritabanın boş olduğu için bu kod tabloları senin için yaratacak.
    const kurulumSQL = `
        CREATE TABLE IF NOT EXISTS profile (
            id INT PRIMARY KEY, ad_soyad VARCHAR(100), biyografi TEXT, resim_url TEXT
        );
        CREATE TABLE IF NOT EXISTS links (
            id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255), url TEXT, 
            platform VARCHAR(50) DEFAULT 'web', tiklanma_sayisi INT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        INSERT IGNORE INTO profile (id, ad_soyad, biyografi, resim_url) 
        VALUES (1, 'Fırat Çoban', 'Yazılım ve Teknoloji', '/images/logo.jpg');
    `;
    db.query(kurulumSQL, (err) => {
        if(err) console.log("Tablo Oluşturma Hatası:", err);
        else console.log("✅ Tablolar Hazırlandı.");
    });
});

// --- 4. ROTALAR ---

// ANA SAYFA
app.get('/', (req, res) => {
    db.query('SELECT * FROM profile WHERE id = 1', (err, profileResult) => {
        db.query('SELECT * FROM links ORDER BY id DESC', (err, linkResult) => {
            if (err) { console.log(err); res.send("Veritabanı hatası"); return; }
            res.render('index', { 
                links: linkResult,
                profile: profileResult[0] || { ad_soyad: 'Admin', biyografi: '', resim_url: '/images/logo.jpg' }
            });
        });
    });
});

// PROFİL DÜZENLEME
app.get('/profile', (req, res) => {
    db.query('SELECT * FROM profile WHERE id = 1', (err, result) => {
        res.render('profile', { profile: result[0] || {} });
    });
});

app.post('/profile/update', upload.single('profil_resmi'), (req, res) => {
    const { ad_soyad, biyografi } = req.body;
    let yeniResimYolu = req.file ? '/images/' + req.file.filename : null;
    let sql = yeniResimYolu ? 
        "UPDATE profile SET ad_soyad = ?, biyografi = ?, resim_url = ? WHERE id = 1" : 
        "UPDATE profile SET ad_soyad = ?, biyografi = ? WHERE id = 1";
    let params = yeniResimYolu ? [ad_soyad, biyografi, yeniResimYolu] : [ad_soyad, biyografi];
    db.query(sql, params, () => res.redirect('/profile'));
});

// ADMİN PANELİ
app.get('/admin', (req, res) => {
    db.query('SELECT * FROM links ORDER BY id DESC', (err, results) => {
        res.render('dashboard', { links: results });
    });
});

// İSTATİSTİK SAYFASI
app.get('/stats', (req, res) => {
    db.query('SELECT * FROM links ORDER BY tiklanma_sayisi DESC', (err, results) => {
        if (err) { console.log(err); return res.send("Veritabanı hatası!"); }
        let total = 0;
        results.forEach(link => { total += link.tiklanma_sayisi; });
        res.render('statistics', { links: results, total: total });
    });
});

// LİNK EKLEME
app.post('/add', (req, res) => {
    const { baslik, url, platform } = req.body;
    let cleanUrl = (url.startsWith('http')) ? url : 'https://' + url;
    db.query("INSERT INTO links (title, url, platform, tiklanma_sayisi) VALUES (?, ?, ?, 0)", 
        [baslik, cleanUrl, platform || 'web'], () => res.redirect('/admin'));
});

// LİNK SİLME
app.get('/delete/:id', (req, res) => {
    db.query('DELETE FROM links WHERE id = ?', [req.params.id], () => res.redirect('/admin'));
});

// YÖNLENDİRME (TIK SAYACI)
app.get('/git/:id', (req, res) => {
    const id = req.params.id;
    db.query("UPDATE links SET tiklanma_sayisi = tiklanma_sayisi + 1 WHERE id = ?", [id], () => {
        db.query("SELECT url FROM links WHERE id = ?", [id], (err, rows) => {
            if(rows.length > 0) res.redirect(rows[0].url);
            else res.redirect('/');
        });
    });
});

// SUNUCUYU BAŞLAT (Render için port ayarı eklendi)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Sunucu Başladı: http://localhost:${PORT}`));