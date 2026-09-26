# SEC Innovation Exemption — referans notları (17 Eylül 2026)

Kaynaklar:
- Basın bülteni 2026-90: https://www.sec.gov/newsroom/press-releases/2026-90-sec-issues-innovation-exemption-facilitate-trading-tokenized-nms-stock-request-comment
- Komisyoner Peirce açıklaması: https://www.sec.gov/newsroom/speeches-statements/peirce-slumber-number-innovation-exemption-statement-091726
- Kararname: https://www.sec.gov/rules-regulations/2026/09/4-927
- Fact sheet: https://www.sec.gov/files/34-106402-fact-sheet.pdf
- Başkan Atkins'in video açıklaması (transkript kullanıcıda)

> Not: Bu dosya hukuki tavsiye değildir. Sunumda "SEC uyumlu" deme; "SEC modelinin
> tanımladığı erişim katmanına yönelik" de.

## Ne oldu (özet)
- SEC, TSV (Tokenized Securities Venue) denen yeni bir kategoriye, tokenize NMS hisselerini
  **permissioned AMM likidite havuzları** üzerinden işlem görebilmesi için "exchange" tanımından
  geçici ve şartlı muafiyet verdi.
- Kendi sermayesiyle tokenize hisse likiditesi sağlayan LP'lere "dealer" tanımından ayrı bir muafiyet verildi.
- Süre: yayımdan itibaren 5 yıl. Kamu görüşüne açık.

## TSV'nin tanımı (Hanko'nun yeri)
TSV iki şey yapar: (1) permissioned katılımcılar için AMM havuzları sağlar,
(2) bu havuzlarda **işleme erişim standartlarını belirler**. → Hanko = (2)'nin onchain katmanı.

## Şartlar ve Hanko eşlemesi
| Şart | Hanko |
|---|---|
| Sembol ve işlem hacmi limitleri | Kapsam dışı (roadmap) |
| Tokenize hisse, geleneksel hisseyle aynı hakları vermeli | Kapsam dışı (token tasarımı) |
| Üçüncü tarafça tokenize edilmişse dayanak hisse issuer'ına yazılı bildirim + itiraz hakkı | Kapsam dışı (roadmap: onchain itiraz kaydı) |
| Smart contract'lar denetlenebilir, açık, public permissionless ledger'da | ✅ açık kaynak, Sepolia |
| Dayanak hissede ana borsa işlemi durdurursa TSV de aynı anda durdurmalı | ✅ Trading Halt |
| Operasyonlar ve işlem faaliyetleri hakkında kamuya bildirim | ✅ Audit sekmesi (onchain event'ler) |
| Katılımcılar işlem için yetkilendirilmiş olmalı (Atkins) | ✅ Swap/LP mühürleri |
| Sentetik enstrüman yok (Atkins) | Kapsam dışı |
| LP'ler ayrı kategori (dealer muafiyeti) | ✅ Ayrı LP mührü |

## Peirce'ın önemli notları
- Kararname DeFi hakkında değil; gerçekten merkeziyetsiz, permissionless sistemler muafiyete ihtiyaç duymuyor.
  → Hanko permissionless havuzları kısıtlamaz; regüle venue'lar içindir.
- TSV'ler constant product dışında, dış fiyat kaynakları kullanan mekanizmalar da kullanabilir.
- Muafiyet, kalıcı kurallar yazılmadan önce piyasanın nasıl çalıştığını gözlemlemek için geçici bir pencere.

## Sunumda kullanılabilecek kısa alıntılar (her biri kısa tutuldu)
- Atkins (video): participants must have been "cleared to trade tokenized NMS stock"
- Atkins (video): "We are not cementing today's technology as the standard for tomorrow."
- Basın bülteni: TSVs set "standards for persons to access trading"
- Peirce: "This order is not about decentralized finance."
- Peirce: "a small step toward waking up to a tokenized tomorrow"

## Pitch cümlesi önerisi
"SEC, tokenize hisse venue'larına iki iş verdi: havuz sağlamak ve kimin işlem yapabileceğine
karar vermek. Uniswap birincisini çözdü. Hanko ikincisini çözüyor: ENSv2 ile süreli, iptal
edilebilir, delege edilebilir ve kamuya açık onchain yetkiler."
