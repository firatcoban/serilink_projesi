const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer'); 

const app = express();

// --- AYARLAR ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

// OTURUM
app.use(session({
    secret: 'gizli_anahtar_serilink_v23_final_armored',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, './public/images/'); },
    filename: function (req, file, cb) { cb(null, 'profil-' + Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// 🔥 MAİL AYARLARI (PORT 587 - GOOGLE ONAYLI) 🔥
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587, 
    secure: false, // 587 için false şart
    requireTLS: true,
    auth: {
        user: 'frtcbn65@gmail.com', 
        // ⚠️ 16 HANELİ UYGULAMA ŞİFRENİ BURAYA YAZ
        pass: 'autm fxbz celj uzpr' 
    },
    tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
    }
});

// 🔥 VERİTABANI BAĞLANTISI (RECONNECT ÖZELLİKLİ) 🔥
// Eğer bağlantı koparsa sunucuyu çökertmez, tekrar bağlar.
const dbConfig = {
    host: 'b9jczsecmhesvtz8fkx0-mysql.services.clever-cloud.com',           
    user: 'uzzt3cxlzejgx2x3',           
    password: 'cI3z7JLs2OHiQ23zOj4M',   
    database: 'b9jczsecmhesvtz8fkx0',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true
};

let db;

function handleDisconnect() {
    db = mysql.createPool(dbConfig); 

    db.on('error', function(err) {
        console.log('DB Hatası (Otomatik Düzeltiliyor):', err);
        if(err.code === 'PROTOCOL_CONNECTION_LOST') {
            handleDisconnect(); 
        } else {
            throw err;
        }
    });
}

handleDisconnect(); 

// OTOMATİK VERİTABANI TAMİRİ (HAFİF)
const autoFixDB = () => {
    db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(100) UNIQUE", (e)=>{});
    db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code VARCHAR(10)", (e)=>{});
};

const girisZorunlu = (req, res, next) => {
    if (!req.session.userId) return res.redirect('/login');
    next();
};

// --- ROTALAR ---

app.get('/', (req, res) => {
    if (req.session.userId) res.redirect('/admin'); else res.redirect('/login'); 
});

app.get('/login', (req, res) => { autoFixDB(); res.render('login'); });

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
        if(err) return res.send("DB Hatası: " + err.message);
        
        if (results.length > 0) {
            const user = results[0];
            const passCheck = user.password || '$2a$10$dummy'; 
            const match = await bcrypt.compare(password, passCheck);
            if (match) {
                req.session.userId = user.id;
                req.session.username = user.username;
                req.session.ad_soyad = user.ad_soyad;
                res.redirect('/admin');
            } else {
                res.send('<h1>Şifre Yanlış</h1><a href="/login">Geri</a>');
            }
        } else {
            res.send('<h1>Kullanıcı Yok</h1><a href="/login">Geri</a>');
        }
    });
});

// 🔥 ŞİFREMİ UNUTTUM 🔥
app.get('/forgot-password', (req, res) => { res.render('forgot-password'); });

app.post('/send-code', (req, res) => {
    const { email } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000); 

    console.log("Mail gönderiliyor:", email);

    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if(err) return res.send("<h1>DB BAĞLANTI HATASI</h1><p>Veritabanı sunucusu cevap vermiyor. Lütfen 1 dakika sonra tekrar dene.</p><p>Hata: "+err.message+"</p>");

        if(results.length === 0) {
            return res.send(`
                <div style="text-align:center; padding:50px; font-family:sans-serif; background:#0f172a; color:white; height:100vh;">
                    <h1>❌ E-posta Bulunamadı</h1>
                    <p>Sistemde <b>${email}</b> yok. Kayıtlı olduğuna emin misin?</p>
                    <a href='/forgot-password' style="color:yellow">Geri</a>
                </div>
            `);
        }

        db.query('UPDATE users SET reset_code = ? WHERE email = ?', [code, email], (err) => {
            if(err) return res.send("Kod Kaydetme Hatası: " + err.message);

            const mailOptions = {
                from: '"Serilink Destek" <frtcbn65@gmail.com>',
                to: email,
                subject: '🔑 Sıfırlama Kodun',
                html: `<h1>${code}</h1><p>Kodunuz budur.</p>`
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error("Nodemailer Hatası:", error);
                    return res.send(`
                        <div style="padding:20px; color:red; font-family:monospace; background:black;">
                            <h1>MAIL GÖNDERİLEMEDİ!</h1>
                            <p><b>Hata:</b> ${error.message}</p>
                            <hr>
                            <p>Google izni alındı. Tekrar dene.</p>
                            <a href="/forgot-password" style="color:white; font-size:20px;">Tekrar Dene</a>
                        </div>
                    `);
                }
                console.log("Mail gitti:", info.response);
                res.render('verify-code', { email: email });
            });
        });
    });
});

app.post('/verify-code', (req, res) => {
    const { email, code } = req.body;
    db.query('SELECT * FROM users WHERE email = ? AND reset_code = ?', [email, code], (err, results) => {
        if(results.length > 0) res.render('new-password', { email: email });
        else res.send("<h1>❌ Yanlış Kod</h1><a href='/forgot-password'>Geri</a>");
    });
});

app.post('/reset-password-final', async (req, res) => {
    const { email, new_password } = req.body;
    const hashed = await bcrypt.hash(new_password, 10);
    db.query('UPDATE users SET password = ?, reset_code = NULL WHERE email = ?', [hashed, email], (err) => {
        res.send("<h1>✅ Başarılı!</h1><p>Şifren değiştirildi.</p><a href='/login'>Giriş Yap</a>");
    });
});

// DİĞER ROTALAR
app.get('/admin', girisZorunlu, (req, res) => {
    const sql = `SELECT u.*, COUNT(l.id) as link_sayisi FROM users u LEFT JOIN links l ON u.id = l.user_id GROUP BY u.id`;
    db.query(sql, (err, results) => {
        res.render('admin', { users: results, activeId: req.session.userId });
    });
});
app.get('/settings', girisZorunlu, (req, res) => {
    db.query('SELECT * FROM users WHERE id = ?', [req.session.userId], (err, result) => {
        res.render('settings', { user: result[0] });
    });
});
app.post('/settings/update', girisZorunlu, async (req, res) => {
    const { username, ad_soyad, email, password } = req.body;
    const userId = req.session.userId;
    let sql = "", params = [];
    if (password && password.trim() !== "") {
        const hashed = await bcrypt.hash(password, 10);
        sql = "UPDATE users SET username = ?, ad_soyad = ?, email = ?, password = ? WHERE id = ?";
        params = [username, ad_soyad, email, hashed, userId];
    } else {
        sql = "UPDATE users SET username = ?, ad_soyad = ?, email = ? WHERE id = ?";
        params = [username, ad_soyad, email, userId];
    }
    db.query(sql, params, (err) => {
        if(err) return res.send("Güncelleme Hatası: " + err.message);
        req.session.username = username;
        req.session.ad_soyad = ad_soyad;
        res.redirect('/admin');
    });
});
app.get('/admin/:username', girisZorunlu, (req, res) => {
    const kadi = req.params.username;
    db.query('SELECT * FROM users WHERE username = ?', [kadi], (err, userResult) => {
        if (!userResult.length) return res.send("Kullanıcı yok.");
        const user = userResult[0];
        db.query('SELECT * FROM links WHERE user_id = ? ORDER BY id DESC', [user.id], (err, links) => {
            res.render('dashboard', { user: user, links: links });
        });
    });
});
app.get('/profile/:username', girisZorunlu, (req, res) => {
    db.query('SELECT * FROM users WHERE username = ?', [req.params.username], (err, result) => {
        res.render('profile', { profile: result[0] });
    });
});
app.post('/admin/create-user', girisZorunlu, async (req, res) => {
    const { username, ad_soyad, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    db.query('INSERT INTO users (username, ad_soyad, password, resim_url) VALUES (?, ?, ?, ?)', [username, ad_soyad, hashed, '/images/logo.jpg'], () => res.redirect('/admin'));
});
app.get('/admin/delete-user/:id', girisZorunlu, (req, res) => {
    if(req.params.id == req.session.userId) return res.send("Kendini silemezsin!");
    db.query('DELETE FROM links WHERE user_id = ?', [req.params.id], () => {
        db.query('DELETE FROM users WHERE id = ?', [req.params.id], () => res.redirect('/admin'));
    });
});
app.get('/admin/reset-password/:id', girisZorunlu, async (req, res) => {
    const defaultHash = await bcrypt.hash("123456", 10);
    db.query("UPDATE users SET password = ? WHERE id = ?", [defaultHash, req.params.id], () => res.redirect('/admin'));
});
app.post('/add', girisZorunlu, (req, res) => {
    const { baslik, url, platform, hidden_username } = req.body;
    let cleanUrl = (url.startsWith('http')) ? url : 'https://' + url;
    db.query('SELECT id FROM users WHERE username=?', [hidden_username], (e, r) => {
        db.query("INSERT INTO links (user_id, title, url, platform) VALUES (?,?,?,?)", [r[0].id, baslik, cleanUrl, platform||'web'], ()=> res.redirect('/admin/'+hidden_username));
    });
});
app.post('/edit/update', upload.single('profil_resmi'), (req, res) => { res.redirect('/admin'); });
app.get('/delete/:id', girisZorunlu, (req, res) => {
    const u = req.query.u;
    db.query('DELETE FROM links WHERE id=?', [req.params.id], () => res.redirect('/admin/'+u));
});
app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/login')); });
app.get('/register', (req, res) => { res.render('register'); });
app.post('/register', async (req, res) => {
    const { username, ad_soyad, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    db.query('INSERT INTO users (username, ad_soyad, password, resim_url) VALUES (?, ?, ?, ?)', [username, ad_soyad, hashed, '/images/logo.jpg'], ()=> res.redirect('/login'));
});
app.get('/:kullaniciadi', (req, res) => {
    const k = req.params.kullaniciadi;
    if(['admin','login','register','logout','add','edit','delete','settings', 'forgot-password', 'send-code', 'verify-code', 'reset-password-final'].includes(k)) return;
    db.query('SELECT * FROM users WHERE username=?', [k], (e, u) => {
        if(!u || !u.length) return res.send("Kullanıcı yok");
        db.query('SELECT * FROM links WHERE user_id=? ORDER BY id DESC', [u[0].id], (err, l) => res.render('index', {profile:u[0], links:l}));
    });
});
app.get('/git/:id', (req, res) => {
    db.query("UPDATE links SET tiklanma_sayisi = tiklanma_sayisi + 1 WHERE id = ?", [req.params.id], () => {
        db.query("SELECT url FROM links WHERE id = ?", [req.params.id], (err, rows) => {
            if(rows.length > 0) res.redirect(rows[0].url); else res.redirect('/');
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Sistem Hazır!`));