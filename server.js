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

// --- VERİTABANI BAĞLANTISI (POOOL SİSTEMİ - ÇELİK YELEK 🛡️) ---
// createConnection yerine createPool kullanıyoruz. Bu sayede bağlantı asla kopmaz.
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

// Bağlantıyı test et
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ VERİTABANI HATASI:', err.message);
    } else {
        console.log('✅ Veritabanına Bağlandı (Pool Modu Aktif)');
        
        // --- BAŞLANGIÇ KURULUMU (Otomatik Tablo ve Kullanıcı Oluşturma) ---
        const initSQL = `
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

            -- FIRAT VE BUĞRA YOKSA EKLE (IGNORE varsa atlar) --
            INSERT IGNORE INTO users (id, username, ad_soyad, biyografi, resim_url) VALUES 
            (1, 'firat', 'Fırat Çoban', 'Kurucu & Geliştirici', 'https://via.placeholder.com/150'),
            (2, 'BuGüzelsoy', 'Buğra Güzelsoy', 'İçerik Üreticisi', 'https://via.placeholder.com/150');
        `;
        
        connection.query(initSQL, (error) => {
            connection.release(); // Bağlantıyı havuza geri bırak
            if (error) console.log("Tablo Kurulum Hatası:", error);
            else console.log("✅ Tablolar ve Kullanıcılar Kontrol Edildi.");
        });
    }
});

// --- ROTALAR ---

// 1. ANA SAYFA (Landing Page)
app.get('/', (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
        if (err) return res.send("Veritabanı hatası: " + err.message);
        res.render('landing', { users: results });
    });
});

// 2. KUMANDA MERKEZİ (KİMİ SEÇECEKSİN?)
app.get('/admin', (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
        if (err) return res.send("Hata: " + err.message);
        // Eğer admin.ejs yoksa basit liste göster (Güvenlik)
        res.render('admin', { users: results }, (err, html) => {
            if (err) {
                 // Admin.ejs yoksa, geçici bir seçim ekranı oluştur
                 let htmlList = results.map(u => `<a href="/admin/${u.username}" style="display:block; padding:10px; margin:5px; background:#ddd;">${u.ad_soyad} Yönet</a>`).join('');
                 res.send(`<h1>Kullanıcı Seç:</h1>${htmlList}`);
            } else {
                res.send(html);
            }
        });
    });
});

// 3. DASHBOARD (AYDINLIK PANEL - Link Yönetimi)
app.get('/admin/:username', (req, res) => {
    const kadi = req.params.username;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (err || userResult.length === 0) return res.send("Kullanıcı bulunamadı.");
        const user = userResult[0];
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [user.id], (err, links) => {
            res.render('dashboard', { user: user, links: links });
        });
    });
});

// 4. PROFİL AYARLARI (KARANLIK PANEL - Resim Değiştirme)
app.get('/profile/:username', (req, res) => {
    const kadi = req.params.username;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (err || userResult.length === 0) return res.send("Kullanıcı bulunamadı.");
        res.render('profile', { profile: userResult[0] });
    });
});

// 5. İŞLEMLER (EKLE / GÜNCELLE / SİL)
app.post('/add', (req, res) => {
    const { baslik, url, platform, hidden_username } = req.body;
    let cleanUrl = (url.startsWith('http')) ? url : 'https://' + url;
    
    db.query('SELECT id FROM users WHERE username = ?', [hidden_username], (err, result) => {
        if (err || result.length === 0) return res.send("Hata: Kullanıcı yok");
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
    const username = req.query.u; // Linkten gelen kullanıcı adı
    db.query('DELETE FROM links WHERE id = ?', [req.params.id], () => res.redirect('/admin/' + username));
});

// 6. CANLI PROFİL (Ziyaretçiler İçin)
app.get('/:kullaniciadi', (req, res) => {
    const kadi = req.params.kullaniciadi;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (err || userResult.length === 0) return res.send("Kullanıcı bulunamadı.");
        const user = userResult[0];
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [user.id], (err, linkResult) => {
            res.render('index', { profile: user, links: linkResult });
        });
    });
});

// 7. YÖNLENDİRME
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