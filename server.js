const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, './public/images/'); },
    filename: function (req, file, cb) { cb(null, 'profil-' + Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// ⚠️ VERİTABANI BİLGİLERİNİ GİR (Clever Cloud)
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

console.log("✅ Veritabanı Havuzu Oluşturuldu.");

// --- ROTALAR ---

// 🚨 1. ACİL KURTARMA VE KURULUM ROTASI (BUNA TIKLAYINCA DÜZELECEK)
app.get('/onar', (req, res) => {
    const sql = `
        -- Tabloları Garantiye Al --
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

        -- Kullanıcıları Zorla Ekle (Varsa Güncelle) --
        INSERT INTO users (id, username, ad_soyad, biyografi, resim_url) VALUES 
        (1, 'firat', 'Fırat Çoban', 'Kurucu', 'https://via.placeholder.com/150'),
        (2, 'BuGüzelsoy', 'Buğra Güzelsoy', 'İçerik Üreticisi', 'https://via.placeholder.com/150')
        ON DUPLICATE KEY UPDATE ad_soyad=VALUES(ad_soyad);
    `;

    db.query(sql, (err, result) => {
        if (err) {
            res.send("<h1>❌ HATA OLUŞTU:</h1><pre>" + err.message + "</pre>");
        } else {
            res.send(`
                <div style="text-align:center; font-family:sans-serif; padding:50px;">
                    <h1 style="color:green;">✅ SİSTEM ONARILDI!</h1>
                    <p>Fırat ve Buğra kullanıcıları veritabanına zorla eklendi.</p>
                    <br>
                    <a href="/admin" style="background:black; color:white; padding:15px 30px; text-decoration:none; border-radius:10px; font-size:20px;">
                        Şimdi Panele Git 👉
                    </a>
                </div>
            `);
        }
    });
});

// 2. ANA SAYFA
app.get('/', (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
        if (err) return res.send("DB Hatası: " + err.message);
        res.render('landing', { users: results });
    });
});

// 3. KUMANDA MERKEZİ
app.get('/admin', (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
        if (err) return res.send("DB Hatası: " + err.message);
        res.render('admin', { users: results });
    });
});

// 4. DASHBOARD (LİNK PANELİ)
app.get('/admin/:username', (req, res) => {
    const kadi = req.params.username;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (err) return res.send("Hata: " + err.message);
        
        // KULLANICI YOKSA HATA VERMEK YERİNE UYARI VERELİM
        if (!userResult || userResult.length === 0) {
            return res.send(`
                <h1>⚠️ Kullanıcı Bulunamadı: ${kadi}</h1>
                <p>Lütfen önce <a href="/onar">/onar</a> sayfasına giderek veritabanını tamir et.</p>
            `);
        }

        const user = userResult[0];
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [user.id], (err, links) => {
            res.render('dashboard', { user: user, links: links });
        });
    });
});

// 5. PROFİL AYARLARI
app.get('/profile/:username', (req, res) => {
    const kadi = req.params.username;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, result) => {
        if (!result || result.length === 0) return res.send("Kullanıcı yok. Önce /onar sayfasına git.");
        res.render('profile', { profile: result[0] });
    });
});

// 6. İŞLEMLER (EKLE / GÜNCELLE / SİL)
app.post('/add', (req, res) => {
    const { baslik, url, platform, hidden_username } = req.body;
    let cleanUrl = (url.startsWith('http')) ? url : 'https://' + url;
    db.query('SELECT id FROM users WHERE username = ?', [hidden_username], (err, result) => {
        if (result.length === 0) return res.send("Kullanıcı bulunamadı");
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

// 7. CANLI PROFİL
app.get('/:kullaniciadi', (req, res) => {
    const kadi = req.params.kullaniciadi;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (!userResult || userResult.length === 0) return res.send("Böyle biri yok.");
        const user = userResult[0];
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [user.id], (err, linkResult) => {
            res.render('index', { profile: user, links: linkResult });
        });
    });
});

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