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
    destination: function (req, file, cb) { cb(null, './public/images/'); },
    filename: function (req, file, cb) { cb(null, 'profil-' + Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// --- 3. VERİTABANI BAĞLANTISI ---
// ⚠️ BİLGİLERİNİ BURAYA GİR (Tırnakları silme!)
const db = mysql.createConnection({
    host: 'b9jczsecmhesvtz8fkx0-mysql.services.clever-cloud.com',           // Clever Cloud Host
    user: 'uzzt3cxlzejgx2x3',           // Clever Cloud User
    password: 'cI3z7JLs2OHiQ23zOj4M',   // Clever Cloud Password (Şifre)
    database: 'b9jczsecmhesvtz8fkx0',   // Clever Cloud Database Name
    multipleStatements: true
});

db.connect((err) => {
    if (err) { console.error('❌ Bağlantı Hatası:', err.message); return; }
    console.log('✅ Veritabanına Bağlandı!');
    
    // --- 4. SAAS TABLOLARI VE GÜNCELLEME ---
    // Buradaki kod, tablolar yoksa oluşturur, varsa kullanıcını 'BuGüzelsoy' yapar.
    const saasSQL = `
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

        -- FIRAT KULLANICISI (Eğer yoksa ekle) --
        INSERT INTO users (id, username, ad_soyad, biyografi, resim_url) 
        VALUES (1, 'firat', 'Fırat Çoban', 'SaaS Kurucusu & Yazılımcı', '/images/logo.jpg')
        ON DUPLICATE KEY UPDATE ad_soyad='Fırat Çoban';

        -- BUĞRA KULLANICISI (İsmi 'BuGüzelsoy' Olarak Güncelliyoruz) --
        INSERT INTO users (id, username, ad_soyad, biyografi, resim_url) 
        VALUES (2, 'BuGüzelsoy', 'Buğra Güzelsoy', 'Girişimci & İçerik Üreticisi', 'https://via.placeholder.com/150')
        ON DUPLICATE KEY UPDATE username='BuGüzelsoy', ad_soyad='Buğra Güzelsoy';
    `;
    
    db.query(saasSQL, (err) => {
        if(err) console.log("Tablo/Kullanıcı Oluşturma Hatası:", err);
        else console.log("✅ Tablolar ve Kullanıcılar Hazır!");
    });
});

// --- 5. ROTALAR ---

// ANA SAYFA (Landing Page)
app.get('/', (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
        if (err) {
            // Hatayı ekrana basıyoruz ki nedenini görelim
            console.log(err);
            res.send("<h1>Veritabanı Hatası:</h1><pre>" + err.message + "</pre>");
        } else {
            // Eğer landing.ejs yoksa basit bir liste göster (Güvenlik önlemi)
            res.render('landing', { users: results }, (err, html) => {
                if (err) {
                    console.log("Landing render hatası:", err);
                    res.send("<h1>Landing Sayfası Bulunamadı!</h1><p>views klasöründe landing.ejs olduğundan emin ol.</p>");
                } else {
                    res.send(html);
                }
            });
        }
    });
});

// PROFİL GÖRÜNTÜLEME
app.get('/:kullaniciadi', (req, res) => {
    const kadi = req.params.kullaniciadi;

    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (err) { return res.send("Veritabanı hatası: " + err.message); }
        
        if (userResult.length === 0) {
            return res.send("<h1 style='text-align:center; margin-top:50px;'>Böyle bir kullanıcı yok! 😕</h1>");
        }

        const user = userResult[0];

        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [user.id], (err, linkResult) => {
            res.render('index', { profile: user, links: linkResult });
        });
    });
});

// YÖNLENDİRME
app.get('/git/:id', (req, res) => {
    db.query("UPDATE links SET tiklanma_sayisi = tiklanma_sayisi + 1 WHERE id = ?", [req.params.id], () => {
        db.query("SELECT url FROM links WHERE id = ?", [req.params.id], (err, rows) => {
            if(rows.length > 0) res.redirect(rows[0].url);
            else res.redirect('/');
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Sunucu Başladı!`));