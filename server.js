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
// ⚠️ BURAYA KENDİ BİLGİLERİNİ GİR
const db = mysql.createConnection({
    host: 'b9jczsecmhesvtz8fkx0-mysql.services.clever-cloud.com',
    user: 'uzzt3cxlzejgx2x3',
    password: 'cI3z7JLs2OHiQ23zOj4M',
    database: 'b9jczsecmhesvtz8fkx0',
    multipleStatements: true
});

db.connect((err) => {
    if (err) console.error('❌ Hata:', err);
    else console.log('✅ Bağlandı!');
});

// --- YARDIMCI FONKSİYON: Kullanıcı Bulamazsa Listeyi Göster ---
function kullaniciYoksaListele(res, arananIsim) {
    db.query('SELECT * FROM users', (err, users) => {
        let listeHTML = users.map(u => `<li><strong>${u.username}</strong> (ID: ${u.id})</li>`).join('');
        res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px;">
                <h1 style="color:red;">⚠️ Kullanıcı Bulunamadı!</h1>
                <p>Sistem <strong>"${arananIsim}"</strong> ismini aradı ama bulamadı.</p>
                <hr>
                <h3>✅ Veritabanında Kayıtlı Olanlar Şunlar:</h3>
                <ul style="list-style:none; padding:0; font-size:18px;">
                    ${listeHTML}
                </ul>
                <p><em>Lütfen linkteki ismin yukarıdaki listedekilerle AYNI olduğundan emin ol.</em></p>
                <a href="/admin">🔙 Panele Dön</a>
            </div>
        `);
    });
}

// --- ROTALAR ---

// 1. ANA SAYFA
app.get('/', (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
        res.render('landing', { users: results });
    });
});

// 2. KUMANDA MERKEZİ
app.get('/admin', (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
        res.render('admin', { users: results });
    });
});

// 3. LİNK YÖNETİM PANELİ (Dashboard)
app.get('/admin/:username', (req, res) => {
    const kadi = req.params.username;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (userResult.length === 0) {
            // HATA VARSA LİSTEYİ GÖSTER
            return kullaniciYoksaListele(res, kadi);
        }
        const user = userResult[0];
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [user.id], (err, links) => {
            res.render('dashboard', { user: user, links: links });
        });
    });
});

// 4. LİNK EKLEME
app.post('/add', (req, res) => {
    const { baslik, url, platform, hidden_username } = req.body;
    let cleanUrl = (url.startsWith('http')) ? url : 'https://' + url;

    db.query('SELECT id FROM users WHERE username = ?', [hidden_username], (err, result) => {
        if (result.length === 0) return res.send("Hata: Kullanıcı bulunamadı.");
        const userId = result[0].id;
        db.query("INSERT INTO links (user_id, title, url, platform) VALUES (?, ?, ?, ?)", 
            [userId, baslik, cleanUrl, platform || 'web'], 
            () => res.redirect('/admin/' + hidden_username)
        );
    });
});

// 5. LİNK SİLME
app.get('/delete/:id', (req, res) => {
    const username = req.query.u; 
    db.query('DELETE FROM links WHERE id = ?', [req.params.id], () => {
        res.redirect('/admin/' + username);
    });
});

// 6. PROFİL DÜZENLEME (Profile.ejs)
app.get('/profile/:username', (req, res) => {
    const kadi = req.params.username;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, result) => {
        if (result.length === 0) {
            // HATA VARSA LİSTEYİ GÖSTER
            return kullaniciYoksaListele(res, kadi);
        }
        res.render('profile', { profile: result[0] });
    });
});

// 7. PROFİL GÜNCELLEME İŞLEMİ
app.post('/edit/update', upload.single('profil_resmi'), (req, res) => {
    const { ad_soyad, biyografi, hidden_username } = req.body;
    let yeniResimYolu = req.file ? '/images/' + req.file.filename : null;
    
    let sql = yeniResimYolu ? 
        "UPDATE users SET ad_soyad = ?, biyografi = ?, resim_url = ? WHERE username = ?" : 
        "UPDATE users SET ad_soyad = ?, biyografi = ? WHERE username = ?";
    let params = yeniResimYolu ? [ad_soyad, biyografi, yeniResimYolu, hidden_username] : [ad_soyad, biyografi, hidden_username];

    db.query(sql, params, () => res.redirect('/profile/' + hidden_username));
});

// 8. CANLI PROFİL (İzleyici Sayfası)
app.get('/:kullaniciadi', (req, res) => {
    const kadi = req.params.kullaniciadi;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (err || userResult.length === 0) {
            return res.send("<h2>Böyle bir kullanıcı yok.</h2>");
        }
        const user = userResult[0];
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [user.id], (err, linkResult) => {
            res.render('index', { profile: user, links: linkResult });
        });
    });
});

// 9. LİNK YÖNLENDİRME
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