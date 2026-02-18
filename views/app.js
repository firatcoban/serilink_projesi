// Linke tıklandığında çalışacak rota (Örn: /git/5)
app.get('/git/:id', (req, res) => {
    const linkId = req.params.id;

    // 1. ÖNCE ASIL URL'Yİ BUL (Kullanıcıyı hiç bekletme)
    db.query("SELECT url FROM links WHERE id = ?", [linkId], (err, rows) => {
        if (err || rows.length === 0) {
            console.log("Link bulunamadı veya db hatası:", err);
            return res.redirect('/');
        }
        
        // Kullanıcıyı ANINDA hedef adrese yönlendir
        res.redirect(rows[0].url);

        // 2. YÖNLENDİRME BİTTİKTEN SONRA ARKA PLANDA SAYACI ARTTIR
        const sql = "UPDATE links SET tiklanma_sayisi = tiklanma_sayisi + 1 WHERE id = ?";
        db.query(sql, [linkId], (updateErr) => {
            if (updateErr) {
                console.log("Tıklanma sayısı güncellenemedi:", updateErr);
            }
        });
    });
});