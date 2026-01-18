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
// ⚠️ ŞİFRELERİNİ KONTROL ET! YANLIŞSA BEYAZ SAYFA ALIRSIN.
const db = mysql.createConnection({
    host: 'b9jczsecmhesvtz8fkx0-mysql.services.clever-cloud.com',           
    user: 'uzzt3cxlzejgx2x3',           
    password: 'cI3z7JLs2OHiQ23zOj4M',   
    database: 'b9jczsecmhesvtz8fkx0',   
    multipleStatements: true
});

db.connect((err) => {
    if (err) { 
        console.error('❌ DB Bağlantı Hatası:', err.message); 
    } else {
        console.log('✅ Veritabanına Başarıyla Bağlandı!');
    }
});

// --- HATA GÖSTERİCİ FONKSİYON ---
function hataGoster(res, hataMesaji, detay) {
    console.log("HATA OLUŞTU:", hataMesaji, detay);
    res.send(`
        <div style="background:#0f172a; color:white; padding:50px; font-family:sans-serif; text-align:center; height:100vh;">
            <h1 style="color:#FF5400; font-size:50px;">💥 BİR SORUN VAR!</h1>
            <h2 style="color:#FFD700;">${hataMesaji}</h2>
            <div style="background:#333; padding:20px; border-radius:10px; display:inline-block; text-align:left;">
                <pre style="color:#ff7b7b; font-size:16px;">${detay}</pre>
            </div>
            <br><br>
            <a href="/admin" style="color:white; font-size:20px;">🔙 Geri Dön ve Tekrar Dene</a>
        </div>
    `);
}

// --- ROTALAR ---

// 1. ANA SAYFA
app.get('/', (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
        if (err) return hataGoster(res, "Kullanıcılar Çekilemedi", err.message);
        res.render('landing', { users: results });
    });
});

// 2. KUMANDA MERKEZİ (Kullanıcı Seçimi)
app.get('/admin', (req, res) => {
    db.query('SELECT * FROM users', (err, results) => {
        if (err) return hataGoster(res, "Veritabanı Bağlantı Hatası", "Şifreni veya Host adresini yanlış girmiş olabilirsin.\n" + err.message);
        res.render('admin', { users: results });
    });
});

// 3. LİNK YÖNETİM PANELİ (Dashboard)
app.get('/admin/:username', (req, res) => {
    const kadi = req.params.username;
    
    // Kullanıcıyı Bul
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (err) return hataGoster(res, "Veritabanı Hatası (Kullanıcı Sorgusu)", err.message);
        
        if (!userResult || userResult.length === 0) {
            return hataGoster(res, "Kullanıcı Bulunamadı", `Aranan İsim: "${kadi}"\nVeritabanında böyle biri yok.`);
        }

        const user = userResult[0];
        
        // Linkleri Bul
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [user.id], (err, links) => {
            if (err) return hataGoster(res, "Linkler Çekilemedi", err.message);
            
            // Dashboard'u render etmeye çalış
            try {
                res.render('dashboard', { user: user, links: links });
            } catch (renderError) {
                hataGoster(res, "Dashboard Dosyasında Kod Hatası Var", "views/dashboard.ejs dosyasında bir hata yaptın.\n" + renderError.message);
            }
        });
    });
});

// 4. LİNK EKLEME
app.post('/add', (req, res) => {
    const { baslik, url, platform, hidden_username } = req.body;
    let cleanUrl = (url.startsWith('http')) ? url : 'https://' + url;

    db.query('SELECT id FROM users WHERE username = ?', [hidden_username], (err, result) => {
        if (err || result.length === 0) return hataGoster(res, "Kullanıcı Bulunamadı (Ekleme Sırasında)", err ? err.message : "Kullanıcı yok");
        
        const userId = result[0].id;
        db.query("INSERT INTO links (user_id, title, url, platform) VALUES (?, ?, ?, ?)", 
            [userId, baslik, cleanUrl, platform || 'web'], 
            (err) => {
                if (err) return hataGoster(res, "Link Eklenemedi", err.message);
                res.redirect('/admin/' + hidden_username);
            }
        );
    });
});

// 5. LİNK SİLME
app.get('/delete/:id', (req, res) => {
    const username = req.query.u; 
    db.query('DELETE FROM links WHERE id = ?', [req.params.id], (err) => {
        if (err) return hataGoster(res, "Silinemedi", err.message);
        res.redirect('/admin/' + username);
    });
});

// 6. PROFİL DÜZENLEME (Profile.ejs)
app.get('/profile/:username', (req, res) => {
    const kadi = req.params.username;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, result) => {
        if (err) return hataGoster(res, "Profil Çekilemedi", err.message);
        if (result.length === 0) return hataGoster(res, "Kullanıcı Yok", kadi);
        
        try {
            res.render('profile', { profile: result[0] });
        } catch (e) {
            hataGoster(res, "Profile.ejs Hatası", e.message);
        }
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

    db.query(sql, params, (err) => {
        if (err) return hataGoster(res, "Güncelleme Başarısız", err.message);
        res.redirect('/profile/' + hidden_username);
    });
});

// 8. CANLI PROFİL
app.get('/:kullaniciadi', (req, res) => {
    const kadi = req.params.kullaniciadi;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (err) return hataGoster(res, "Veritabanı Hatası", err.message);
        if (!userResult || userResult.length === 0) return res.send("<h2>Böyle bir kullanıcı yok.</h2>");
        
        const user = userResult[0];
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [user.id], (err, linkResult) => {
            if (err) return hataGoster(res, "Linkler Yüklenemedi", err.message);
            res.render('index', { profile: user, links: linkResult });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Sunucu Başladı!`));