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

// --- VERİTABANI BAĞLANTISI ---
// ⚠️ BURAYA CLEVER CLOUD BİLGİLERİNİ GİR
const db = mysql.createConnection({
    host: 'b9jczsecmhesvtz8fkx0-mysql.services.clever-cloud.com',
    user: 'uzzt3cxlzejgx2x3',
    password: 'cI3z7JLs2OHiQ23zOj4M',
    database: 'b9jczsecmhesvtz8fkx0',
    multipleStatements: true
});

db.connect((err) => {
    if (err) { console.error('❌ Bağlantı Hatası:', err.message); return; }
    console.log('✅ Veritabanına Bağlandı!');
    
    // Tabloları oluştur (Sadece yoksa)
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
    `;
    db.query(saasSQL);
});

// --- ROTALAR ---

// 1. ANA SAYFA
app.get('/', (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
        if (err) res.send("Hata");
        else res.render('landing', { users: results });
    });
});

// 2. PROFİL DÜZENLEME PANELİ (YENİ 🔥)
// Örn: /edit/BuGüzelsoy yazınca Buğra'nın paneli açılır
app.get('/edit/:username', (req, res) => {
    const kadi = req.params.username;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, result) => {
        if (result.length > 0) {
            res.render('profile', { profile: result[0] });
        } else {
            res.send("Kullanıcı bulunamadı!");
        }
    });
});

// 3. PROFİL GÜNCELLEME İŞLEMİ (POST)
app.post('/edit/update', upload.single('profil_resmi'), (req, res) => {
    const { ad_soyad, biyografi, hidden_username } = req.body; // hidden_username formdan gelecek
    
    let yeniResimYolu = req.file ? '/images/' + req.file.filename : null;
    
    let sql = yeniResimYolu ? 
        "UPDATE users SET ad_soyad = ?, biyografi = ?, resim_url = ? WHERE username = ?" : 
        "UPDATE users SET ad_soyad = ?, biyografi = ? WHERE username = ?";
        
    let params = yeniResimYolu ? 
        [ad_soyad, biyografi, yeniResimYolu, hidden_username] : 
        [ad_soyad, biyografi, hidden_username];

    db.query(sql, params, () => {
        res.redirect('/edit/' + hidden_username); // İşlem bitince tekrar panele dön
    });
});

// 4. CANLI PROFİL GÖRÜNTÜLEME
app.get('/:kullaniciadi', (req, res) => {
    const kadi = req.params.kullaniciadi;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (err || userResult.length === 0) return res.send("Kullanıcı yok.");
        const user = userResult[0];
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [user.id], (err, linkResult) => {
            res.render('index', { profile: user, links: linkResult });
        });
    });
});

// 5. LİNK YÖNLENDİRME
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
// test