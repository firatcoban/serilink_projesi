const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');

const app = express();

// --- AYARLAR ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, './public/images/'); },
    filename: function (req, file, cb) { cb(null, 'profil-' + Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// --- VERİTABANI (POOL SİSTEMİ - KOPMAZ BAĞLANTI) ---
const db = mysql.createPool({
    host: 'b9jczsecmhesvtz8fkx0-mysql.services.clever-cloud.com',           
    user: 'uzzt3cxlzejgx2x3',           
    password: 'cI3z7JLs2OHiQ23zOj4M',   
    database: 'b9jczsecmhesvtz8fkx0',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true
});

console.log("✅ Veritabanı Havuzu Hazır.");

// --- ROTALAR ---

// 1. ANA SAYFA (Landing - Cam Tasarım)
app.get('/', (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
        if(err) return res.send("DB Hatası: " + err.message);
        res.render('landing', { users: results });
    });
});

// 2. SİSTEMİ TAMİR ET (Eğer kullanıcılar silinirse buna tıkla)
app.get('/onar', (req, res) => {
    const sql = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            ad_soyad VARCHAR(100),
            biyografi TEXT,
            resim_url TEXT
        );
        CREATE TABLE IF NOT EXISTS links (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT,
            title VARCHAR(255),
            url TEXT,
            platform VARCHAR(50) DEFAULT 'web',
            tiklanma_sayisi INT DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        INSERT IGNORE INTO users (id, username, ad_soyad, biyografi, resim_url) VALUES 
        (1, 'firat', 'Fırat Çoban', 'Kurucu', '/images/logo.jpg'),
        (2, 'BuGüzelsoy', 'Buğra Güzelsoy', 'İçerik Üreticisi', '/images/logo.jpg');
    `;
    db.query(sql, (err) => {
        if(err) res.send(err.message);
        else res.send("<h1>✅ SİSTEM ONARILDI!</h1><a href='/admin'>Panele Git</a>");
    });
});

// 3. KUMANDA MERKEZİ (Seçim Ekranı)
app.get('/admin', (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
        res.render('admin', { users: results });
    });
});

// 4. DASHBOARD (Link Paneli - Karanlık Dragon Ball)
app.get('/admin/:username', (req, res) => {
    const kadi = req.params.username;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (!userResult.length) return res.send("Kullanıcı yok. /onar sayfasına git.");
        const user = userResult[0];
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [user.id], (err, links) => {
            res.render('dashboard', { user: user, links: links });
        });
    });
});

// 5. PROFİL AYARLARI (Resim Değiştirme - Karanlık Dragon Ball)
app.get('/profile/:username', (req, res) => {
    const kadi = req.params.username;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, result) => {
        if (!result.length) return res.send("Kullanıcı yok.");
        res.render('profile', { profile: result[0] });
    });
});

// 6. EKLEME / GÜNCELLEME / SİLME
app.post('/add', (req, res) => {
    const { baslik, url, platform, hidden_username } = req.body;
    let cleanUrl = (url.startsWith('http')) ? url : 'https://' + url;
    db.query('SELECT id FROM users WHERE username = ?', [hidden_username], (err, result) => {
        const userId = result[0].id;
        db.query("INSERT INTO links (user_id, title, url, platform) VALUES (?, ?, ?, ?)", 
            [userId, baslik, cleanUrl, platform || 'web'], 
            () => res.redirect('/admin/' + hidden_username));
    });
});

app.post('/edit/update', upload.single('profil_resmi'), (req, res) => {
    const { ad_soyad, biyografi, hidden_username } = req.body;
    let yeniResimYolu = req.file ? '/images/' + req.file.filename : null;
    let sql = yeniResimYolu ? 
        "UPDATE users SET ad_soyad = ?, biyografi = ?, resim_url = ? WHERE username = ?" : 
        "UPDATE users SET ad_soyad = ?, biyografi = ? WHERE username = ?";
    let params = yeniResimYolu ? [ad_soyad, biyografi, yeniResimYolu, hidden_username] : [ad_soyad, biyografi, hidden_username];
    db.query(sql, params, () => res.redirect('/profile/' + hidden_username));
});

app.get('/delete/:id', (req, res) => {
    const username = req.query.u; 
    db.query('DELETE FROM links WHERE id = ?', [req.params.id], () => res.redirect('/admin/' + username));
});

// 7. CANLI PROFİL (Ziyaretçi Ekranı)
app.get('/:kullaniciadi', (req, res) => {
    const kadi = req.params.kullaniciadi;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (!userResult.length) return res.send("Kullanıcı yok.");
        const user = userResult[0];
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [user.id], (err, linkResult) => {
            res.render('index', { profile: user, links: linkResult });
        });
    });
});

// 8. YÖNLENDİRME (Tık Sayacı)
app.get('/git/:id', (req, res) => {
    db.query("UPDATE links SET tiklanma_sayisi = tiklanma_sayisi + 1 WHERE id = ?", [req.params.id], () => {
        db.query("SELECT url FROM links WHERE id = ?", [req.params.id], (err, rows) => {
            if(rows.length > 0) res.redirect(rows[0].url);
            else res.redirect('/');
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Sunucu Hazır!`));