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
// ⚠️ BURAYA KENDİ BİLGİLERİNİ GİR
const db = mysql.createConnection({
    host: 'b9jczsecmhesvtz8fkx0-mysql.services.clever-cloud.com',
    user: 'uzzt3cxlzejgx2x3',
    password: 'cI3z7JLs2OHiQ23zOj4M',
    database: 'b9jczsecmhesvtz8fkx0',
    multipleStatements: true
});

db.connect((err) => {
    if (err) { console.error('❌ Hata:', err.message); return; }
    console.log('✅ Veritabanına Bağlandı (SaaS Modu)');
    
    // --- 4. SAAS TABLOLARI (Çoklu Kullanıcı) ---
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

        -- ÖRNEK KULLANICILAR (Sadece ilk seferde çalışır) --
        INSERT IGNORE INTO users (id, username, ad_soyad, biyografi, resim_url) VALUES 
        (1, 'firat', 'Fırat Çoban', 'SaaS Kurucusu & Yazılımcı', '/images/logo.jpg'),
        (2, 'ahmet', 'Ahmet Yılmaz', 'Dijital İçerik Üreticisi', 'https://via.placeholder.com/150');
        
        -- ÖRNEK LİNKLER --
        INSERT IGNORE INTO links (id, user_id, title, url) VALUES
        (1, 1, 'GitHub Profilim', 'https://github.com/firatcoban'),
        (2, 2, 'Ahmet YouTube', 'https://youtube.com');
    `;
    
    db.query(saasSQL, (err) => {
        if(err) console.log("Tablo Hatası:", err);
        else console.log("✅ SaaS Tabloları ve Örnek Kullanıcılar Hazır!");
    });
});

// --- 5. ROTALAR (Link Yönetimi) ---

// ANA SAYFA (Landing Page)
app.get('/', (req, res) => {
    res.send(`
        <h1>Serilink'e Hoşgeldiniz!</h1>
        <p>Kendi linkini oluştur.</p>
        <p>Örnek Profiller:</p>
        <ul>
            <li><a href="/firat">/firat</a></li>
            <li><a href="/ahmet">/ahmet</a></li>
        </ul>
    `);
});

// PROFİL GÖRÜNTÜLEME (DİNAMİK ROTA - SİHİR BURADA ✨)
app.get('/:kullaniciadi', (req, res) => {
    const kadi = req.params.kullaniciadi;

    // 1. Önce kullanıcıyı bul
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (err || userResult.length === 0) {
            return res.send("<h1>Böyle bir kullanıcı bulunamadı! 😕</h1>");
        }

        const user = userResult[0];

        // 2. Sonra o kullanıcının linklerini bul
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [user.id], (err, linkResult) => {
            // views/index.ejs dosyasına verileri gönder
            res.render('index', { 
                profile: user,
                links: linkResult
            });
        });
    });
});

// --- ŞİMDİLİK ADMİN PANELİ SADECE FIRAT (ID=1) İÇİN ÇALIŞSIN ---
// (İleride buraya Giriş Yap / Register sistemi ekleyeceğiz)
app.get('/admin/panel', (req, res) => {
    db.query('SELECT * FROM links WHERE user_id = 1 ORDER BY id DESC', (err, results) => {
        res.render('dashboard', { links: results });
    });
});

app.post('/add', (req, res) => {
    const { baslik, url, platform } = req.body;
    let cleanUrl = (url.startsWith('http')) ? url : 'https://' + url;
    // user_id = 1 diyerek sadece Fırat'a ekliyoruz şimdilik
    db.query("INSERT INTO links (user_id, title, url, platform) VALUES (1, ?, ?, ?)", 
        [baslik, cleanUrl, platform || 'web'], () => res.redirect('/admin/panel'));
});

// LİNK SİLME
app.get('/delete/:id', (req, res) => {
    db.query('DELETE FROM links WHERE id = ?', [req.params.id], () => res.redirect('/admin/panel'));
});

// YÖNLENDİRME SİSTEMİ
app.get('/git/:id', (req, res) => {
    db.query("UPDATE links SET tiklanma_sayisi = tiklanma_sayisi + 1 WHERE id = ?", [req.params.id], () => {
        db.query("SELECT url FROM links WHERE id = ?", [req.params.id], (err, rows) => {
            if(rows.length > 0) res.redirect(rows[0].url);
            else res.redirect('/');
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 SaaS Sunucusu Başladı!`));