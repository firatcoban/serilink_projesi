// Linke tıklandığında çalışacak rota (Örn: /git/5)
app.get('/git/:id', (req, res) => {
    const linkId = req.params.id;

    // 1. Veritabanında tıklanma sayısını 1 arttır
    const sql = "UPDATE links SET tiklanma_sayisi = tiklanma_sayisi + 1 WHERE id = ?";
    
    db.query(sql, [linkId], (err, result) => {
        if (err) {
            console.log(err);
            return res.redirect('/'); // Hata olursa ana sayfaya at
        }

        // 2. Asıl linkin URL'sini bul ve oraya yönlendir
        db.query("SELECT url FROM links WHERE id = ?", [linkId], (err, rows) => {
            if (err || rows.length === 0) {
                return res.redirect('/');
            }
            // Ziyaretçiyi gerçek adrese gönder (Youtube, Instagram vb.)
            res.redirect(rows[0].url);
        });
    });
});