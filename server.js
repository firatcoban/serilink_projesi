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

// ⚠️ VERİTABANI BİLGİLERİNİ GİR
const db = mysql.createConnection({
    host: 'b9jczsecmhesvtz8fkx0-mysql.services.clever-cloud.com',
    user: 'uzzt3cxlzejgx2x3',
    password: 'cI3z7JLs2OHiQ23zOj4M',
    database: 'b9jczsecmhesvtz8fkx0',
    multipleStatements: true
});

db.connect((err) => {
    if (err) console.error('❌ Hata:', err.message);
    else console.log('✅ Bağlandı!');
});

// --- ROTALAR ---

// 1. ANA SAYFA
app.get('/', (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
        res.render('landing', { users: results });
    });
});

// 2. KUMANDA MERKEZİ (Kullanıcı Seçimi)
app.get('/admin', (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
        // admin.ejs dosyan var mı? Yoksa basit bir liste gösterir.
        res.render('admin', { users: results });
    });
});

// 3. DASHBOARD (LİNKLERİ YÖNETME YERİ)
app.get('/admin/:username', (req, res) => {
    const kadi = req.params.username;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (!userResult || userResult.length === 0) return res.send("Kullanıcı bulunamadı");
        const user = userResult[0];
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [user.id], (err, links) => {
            // BURADA dashboard.ejs render ediliyor (Senin link panelin)
            res.render('dashboard', { user: user, links: links });
        });
    });
});

// 4. PROFIL AYARLARI (RESİM DEĞİŞTİRME YERİ - DRAGON BALL)
app.get('/profile/:username', (req, res) => {
    const kadi = req.params.username;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, result) => {
        if (!result || result.length === 0) return res.send("Kullanıcı yok");
        // BURADA profile.ejs render ediliyor (Senin ejderhalı tasarımın)
        res.render('profile', { profile: result[0] });
    });
});

// 5. GÜNCELLEME İŞLEMLERİ (LİNK EKLE / PROFİL GÜNCELLE / SİL)
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

// 6. CANLI SİTE (İzleyiciler İçin)
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Sunucu Başladı!`));