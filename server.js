const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const session = require('express-session'); // Oturum yönetimi
const bcrypt = require('bcryptjs'); // Şifreleme

const app = express();

// --- AYARLAR ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

// --- OTURUM (SESSION) AYARLARI ---
app.use(session({
    secret: 'cok_gizli_anahtar_kelime_buraya', // Burayı kafana göre değiştirebilirsin
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 } // 1 saat oturum açık kalır
}));

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, './public/images/'); },
    filename: function (req, file, cb) { cb(null, 'profil-' + Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// --- VERİTABANI BAĞLANTISI ---
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

// --- GÜVENLİK KONTROLÜ (MIDDLEWARE) ---
// Giriş yapmamış birini admin paneline sokmamak için
const girisZorunlu = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    next();
};

// --- ROTALAR ---

// 1. ANA SAYFA (Landing)
app.get('/', (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
        // Giriş yapmışsa navbar farklı görünsün diye user bilgisini gönderiyoruz
        res.render('landing', { users: results, activeUser: req.session.userId });
    });
});

// 2. KAYIT OL SAYFASI
app.get('/register', (req, res) => {
    res.render('register');
});

// 3. KAYIT İŞLEMİ (POST)
app.post('/register', async (req, res) => {
    const { username, ad_soyad, password } = req.body;
    
    // Şifreyi şifrele (Hash)
    const hashedPassword = await bcrypt.hash(password, 10);
    const defaultResim = '/images/logo.jpg'; 

    db.query('INSERT INTO users (username, ad_soyad, password, resim_url) VALUES (?, ?, ?, ?)', 
    [username, ad_soyad, hashedPassword, defaultResim], (err, result) => {
        if (err) {
            console.log(err);
            return res.send(`<h1>Hata: Kullanıcı adı alınmış olabilir.</h1><a href="/register">Geri Dön</a>`);
        }
        res.redirect('/login');
    });
});

// 4. GİRİŞ YAP SAYFASI
app.get('/login', (req, res) => {
    res.render('login');
});

// 5. GİRİŞ İŞLEMİ (POST)
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
        if (results.length === 0) {
            return res.send('<h1>Kullanıcı bulunamadı!</h1><a href="/login">Tekrar Dene</a>');
        }

        const user = results[0];
        // Şifre kontrolü
        const match = await bcrypt.compare(password, user.password);

        if (match) {
            // Şifre doğruysa oturumu başlat
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.ad_soyad = user.ad_soyad;
            res.redirect('/admin'); // Direkt panele at
        } else {
            res.send('<h1>Şifre Yanlış!</h1><a href="/login">Tekrar Dene</a>');
        }
    });
});

// 6. ÇIKIŞ YAP
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// 7. SİSTEMİ ONAR (Şifre sütunu eklemek için)
app.get('/onar', async (req, res) => {
    // Varsayılan şifre: 123456
    const defaultHash = await bcrypt.hash("123456", 10);
    
    const sql = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            ad_soyad VARCHAR(100),
            password VARCHAR(255),
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
        
        -- Eğer password sütunu yoksa ekle (Eski tablolar için)
        SET @dbname = DATABASE();
        SET @tablename = "users";
        SET @columnname = "password";
        SET @preparedStatement = (SELECT IF(
          (
            SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE
              (table_name = @tablename)
              AND (table_schema = @dbname)
              AND (column_name = @columnname)
          ) > 0,
          "SELECT 1",
          "ALTER TABLE users ADD password VARCHAR(255);"
        ));
        PREPARE alterIfNotExists FROM @preparedStatement;
        EXECUTE alterIfNotExists;
        DEALLOCATE PREPARE alterIfNotExists;

        -- Varsayılan kullanıcıları güncelle (Şifreleri 123456 yap)
        INSERT INTO users (id, username, ad_soyad, password, resim_url) VALUES 
        (1, 'admin', 'Kontrol Paneli', '${defaultHash}', '/images/logo.jpg'),
        (2, 'BuGüzelsoy', 'Buğra Güzelsoy', '${defaultHash}', '/images/logo.jpg')
        ON DUPLICATE KEY UPDATE password='${defaultHash}';
    `;
    
    db.query(sql, (err) => {
        if(err) res.send("Hata: " + err.message);
        else res.send("<h1>✅ Sistem Güvenliği Güncellendi!</h1><p>Şifre sütunları eklendi. Varsayılan şifre: 123456</p><a href='/login'>Giriş Yap</a>");
    });
});

// 8. ADMİN PANELİ (ARTIK KORUMALI 🛡️)
// Sadece giriş yapanlar görebilir
app.get('/admin', girisZorunlu, (req, res) => {
    const userId = req.session.userId;
    
    db.query('SELECT * FROM users WHERE id = ?', [userId], (err, userResult) => {
        const user = userResult[0];
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [userId], (err, links) => {
            // Dashboard'a giriş yapan kullanıcının verilerini gönder
            res.render('dashboard', { user: user, links: links });
        });
    });
});

// 9. PROFİL AYARLARI (KORUMALI)
app.get('/profile', girisZorunlu, (req, res) => {
    const userId = req.session.userId;
    db.query('SELECT * FROM users WHERE id = ?', [userId], (err, result) => {
        res.render('profile', { profile: result[0] });
    });
});

// 10. İŞLEMLER (Link Ekle/Sil/Güncelle - Sadece kendi hesabına)
app.post('/add', girisZorunlu, (req, res) => {
    const { baslik, url, platform } = req.body;
    const userId = req.session.userId; // Giriş yapan kişi
    let cleanUrl = (url.startsWith('http')) ? url : 'https://' + url;
    
    db.query("INSERT INTO links (user_id, title, url, platform) VALUES (?, ?, ?, ?)", 
        [userId, baslik, cleanUrl, platform || 'web'], 
        () => res.redirect('/admin'));
});

app.post('/edit/update', girisZorunlu, upload.single('profil_resmi'), (req, res) => {
    const { ad_soyad, biyografi } = req.body;
    const userId = req.session.userId;
    let yeniResimYolu = req.file ? '/images/' + req.file.filename : null;
    
    let sql = yeniResimYolu ? 
        "UPDATE users SET ad_soyad = ?, biyografi = ?, resim_url = ? WHERE id = ?" : 
        "UPDATE users SET ad_soyad = ?, biyografi = ? WHERE id = ?";
    let params = yeniResimYolu ? [ad_soyad, biyografi, yeniResimYolu, userId] : [ad_soyad, biyografi, userId];
    db.query(sql, params, () => res.redirect('/profile'));
});

app.get('/delete/:id', girisZorunlu, (req, res) => {
    // Sadece kendi linkini silebilirsin kontrolü
    db.query('DELETE FROM links WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId], 
        () => res.redirect('/admin'));
});

// 11. CANLI PROFİL (Herkese Açık)
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

// 12. YÖNLENDİRME
app.get('/git/:id', (req, res) => {
    db.query("UPDATE links SET tiklanma_sayisi = tiklanma_sayisi + 1 WHERE id = ?", [req.params.id], () => {
        db.query("SELECT url FROM links WHERE id = ?", [req.params.id], (err, rows) => {
            if(rows.length > 0) res.redirect(rows[0].url);
            else res.redirect('/');
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Güvenli Sunucu Başladı!`));