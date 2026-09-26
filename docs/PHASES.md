# PHASES.md — Adım adım build + test planı

Her faz aynı şablonu izler: **Amaç → Öğrenilecek kavram → Görevler → Testler → UI → Bitti kriteri → Commit**.
Her fazın sonunda kullanıcı UI'da test eder ve onay verir, sonra bir sonraki faza geçilir.

## Öncelik ve kesme çizgileri

| Faz | İçerik | Öncelik | Kaba süre |
|---|---|---|---|
| 0 | Kurulum + doğrulama + System sekmesi | ZORUNLU | 1-1.5 sa |
| 1 | tNVDA token + SimpleChecker | ZORUNLU | 1 sa |
| 2 | Permissioned Pool: likidite + swap (izinli/izinsiz) | ZORUNLU (en riskli) | 3-4 sa |
| 3 | ENSv2 registry'ler + EnsAllowlistChecker + checker değişimi | ZORUNLU | 2-3 sa |
| 4 | Credential provider (World ID) + HumanRegistrar | ZORUNLU (sade tut) | 2-2.5 sa |
| 5 | Issuer konsolu (iptal, unwind, pause) + Audit log | ZORUNLU (min. iptal + audit) | 2 sa |
| 6 | Agent delegasyonu (ENS hiyerarşisi) | **ZORUNLU — projenin ENS kalbi** | 2-3 sa |
| 7 | Demo modu, deploy, README, FEEDBACK, uniswap-ai PR, video | ZORUNLU | 2-3 sa |

**Çekirdek hatırlatma:** Ana hedef ENS + Uniswap. World ikincil: çalışan doğrulama + başarısız yol
+ debrief yeterli, cilaya zaman harcama. Zaman kazanmak gerekirse Faz 4'ü kıs, Faz 6'yı değil.
**Kesme kuralı:** Faz 7'ye en az 3 saat bırak. Faz 2 dört saati geçerse dur ve kullanıcıyla konuş.

---

## Faz 0 — Kurulum, doğrulama, "System" sekmesi

**Amaç:** Kod yazmadan önce dış dünyayı doğrulamak. Yanlış adres/sürüm yüzünden saat kaybetmemek.

**Öğrenilecek kavram:** Hangi kontrat nerede, hangi sürüm; neden router v2.2 şart; ENS'in neden
bir deployment'a sabitlenmesi gerektiği.

**Görevler**
1. Monorepo: `contracts/` (Foundry), `app/` (Next.js + viem/wagmi + Tailwind), `deployments/`, `docs/`.
   `pnpm` kullan.
2. Foundry bağımlılıkları: `Uniswap/v4-periphery` (permissionedPools arayüzleri + PermissionFlags),
   `Uniswap/v4-core`, OpenZeppelin. ENS ABI'lerini `ensdomains/contracts-v2@366de741…`
   deployment JSON'larından `contracts/abis/ens/` altına indir.
3. `deployments/11155111.json`: CLAUDE.md Bölüm 4'teki adreslerle başlat.
4. Doğrulama script'i (`scripts/verify-env.ts` veya `forge script`), şunları okur ve raporlar:
   - Her adreste kod var mı (`extcodesize > 0`)
   - UR proxy `ROOT_REGISTRY()` == `0x9703…a9ce` mı
   - UniversalRouter v2.2'nin factory referansı == PermissionsAdapterFactory mı
     (hangi getter olduğunu kaynak koddan/ABI'den bul, tahmin etme)
   - PermissionedHooks'un `poolManager()` ve factory referansı doğru mu
5. `app/` iskeleti + **System** sekmesi: yukarıdaki kontrolleri yeşil/kırmızı noktalarla gösterir,
   her adrese Etherscan linki verir.

**Testler:** Script Sepolia'da ve Anvil fork'unda çalışıyor. Hepsi yeşil.

**UI:** `System` sekmesi — "Sistem hazır mı?" tablosu.

**Bitti kriteri:** Tüm kontroller yeşil. Kırmızı varsa kullanıcıya hangi booth'a ne sorulacağını yaz.

**Commit:** `chore: scaffold monorepo`, `feat(app): system status tab`, `chore: verify sepolia deployments`

---

## Faz 1 — tNVDA token ve SimpleAllowlistChecker

**Amaç:** Kısıtlı bir token ve en basit checker ile Permissioned Pools'un "kimin girebileceği"
arayüzünü anlamak.

**Öğrenilecek kavram:** `IAllowlistChecker.checkAllowlist(account, token) view returns (PermissionFlag)`,
ERC-165, `SWAP_ALLOWED=0x1` / `LIQUIDITY_ALLOWED=0x2`. Token'ın kendi transfer kısıtı ile havuzun
kısıtı neden aynı kaynaktan beslenmeli.

**Görevler**
1. `SimpleAllowlistChecker.sol`: owner, `setFlags(account, flags)`. ERC-165 desteği.
2. `MockStockToken.sol` (tNVDA, 18 decimals): issuer mint; `_update` içinde alıcı kontrolü:
   `systemAllowed[to]` (adapter, posm vb. issuer listesi) VEYA `checker.checkAllowlist(to, this) != 0`.
   Mint/burn yolu hariç. Checker adresi issuer tarafından değiştirilebilir.
3. Deploy script: token + checker; Alice'e SWAP|LP, Bot'a hiçbir şey; Alice'e tNVDA mint et.
   Adresleri `deployments/*.json`'a yaz.

**Testler (Foundry):** izinli alıcıya transfer geçer, izinsize revert; checker değişince davranış değişir;
ERC-165 `supportsInterface` doğru.

**UI:** `Pool` sekmesinin ilk hali — aktör bakiyeleri ve checker flag'leri tablosu (zincirden okunur).

**Bitti kriteri:** UI'da Alice'in tNVDA bakiyesi ve flag'leri görünüyor; Stranger'a transfer denemesi
revert ediyor ve revert sebebi UI'da okunuyor.

**Commit:** `feat(contracts): mock stock token with allowlist hook`, `feat(contracts): simple allowlist checker`

---

## Faz 2 — Permissioned Pool: adapter, havuz, likidite, swap  ⚠️ en riskli faz

**Amaç:** Uniswap'in resmi Permissioned Pools stack'i ile tNVDA/USDC havuzunu uçtan uca çalıştırmak.

**Öğrenilecek kavram:** Permissions Adapter'ın "kasa + fiş" modeli (virtual token), factory doğrulaması
(1 wei), adapter admin ayarları, PoolKey'de neden adapter adresi kullanıldığı, Universal Router'ın
wrap/unwrap'i, allowlist'in iki kez (router + hook) kontrol edilmesi.

**Görevler** (önce kaynak koddan ilgili fonksiyon imzalarını çıkar ve kullanıcıya göster)
1. `createPermissionsAdapter(tNVDA, issuer, simpleChecker)`.
2. Token'da adapter'ı `systemAllowed` yap, adapter'a 1 wei gönder, `verifyPermissionsAdapter`.
3. Adapter admin: `updateAllowedWrapper(UR v2.2)`, `updateAllowedWrapper(PermissionedPositionManager)`,
   `updateAllowedHook(PermissionedHooks)`, `updateSwappingEnabled(true)`.
   (Quoter da wrapper onayı istiyorsa onu da ekle — kaynak koda bak.)
4. Karşı taraf: Sepolia'da bir test USDC (kendi MockUSDC'n olabilir, ENS'in MockUSDC'si de).
5. Havuz: PoolKey(currency0/1 = adapter ve USDC sıralı, fee, tickSpacing, hooks = PermissionedHooks),
   `initialize`.
6. Likidite: Alice, PermissionedPositionManager üzerinden pozisyon açar.
7. Swap: Alice UR v2.2 üzerinden USDC→tNVDA ve tNVDA→USDC swap eder.
   Stranger aynı swap'ı dener → revert. Revert sebebini decode et.
8. Tüm adımları tek bir idempotent deploy/setup script'inde topla.

**Testler (Foundry fork testleri — gerçek Sepolia kontratlarına karşı):**
- Alice swap edebilir; Stranger edemez (hem router hem hook seviyesinde).
- Alice LP ekleyebilir; sadece SWAP flag'li bir cüzdan LP ekleyemez.
- Swap paused iken revert.
- LP NFT transferi revert (non-transferable).
- Havuzun `afterSwap` Swap event'i yayınlanıyor.

**UI:** `Pool` sekmesi — swap paneli (aktör seçici + miktar), sonuç kartı (başarılı / revert sebebi),
havuz durumu (fiyat, likidite), "Ne oldu?" paneli: router → adapter wrap → PoolManager → hook → unwrap.

**Bitti kriteri:** UI'dan Alice swap yapabiliyor, Stranger reddediliyor, sebebi ekranda. Sepolia'da da çalışıyor.

**Kesme:** 4 saati geçerse dur. Muhtemel sebep listesini (wrapper onayı, swapping enabled, currency sıralaması,
router sürümü) kontrol et ve kullanıcıya Uniswap booth'unda sorulacak somut soruyu yaz.

**Commit:** `feat(contracts): permissioned pool setup script`, `test: fork tests for permissioned swaps`,
`feat(app): swap panel with revert decoding`

---

## Faz 3 — ENSv2 registry'ler ve EnsAllowlistChecker

**Amaç:** Allowlist'in kaynağını basit bir mapping'den ENSv2'ye taşımak — ve bunu **canlı** yapmak
(adapter'da `updateAllowListChecker` ile checker değişimi, demo için güzel bir an).

**Öğrenilecek kavram:** ENSv2 hiyerarşisi (ETHRegistry → tnvda.eth → UserRegistry), VerifiableFactory
proxy'leri, EAC rolleri (root vs name scope), expiry'nin `findOwner`'ı sıfırlaması, transfer rolü
verilmeyen ismin devredilemez olması.

**Görevler**
1. MockUSDC ile ETHRegistrar üzerinden `tnvda.eth` kaydet (registrar akışını ABI'den çıkar).
2. VerifiableFactory ile iki UserRegistry proxy'si deploy et (`initialize(grants)` formatını ABI'den al),
   `setSubregistry` ile `swap.tnvda.eth` ve `lp.tnvda.eth` altına bağla. `setParent` ile geri bağlantı.
3. Roller: issuer'a `ROLE_UNREGISTER` (root), `ROLE_REGISTRAR` şimdilik issuer'da (Faz 4'te HumanRegistrar'a geçecek).
4. `EnsAllowlistChecker.sol`: `label = toLowerHex(account)`; `swapRegistry.findOwner(label) == account`
   → SWAP; `lpRegistry.findOwner(label) == account` → LIQUIDITY. ERC-165.
5. Alice'i iki registry'ye elle kaydet (`roleBitmap = 0` → devredilemez, `expiry = now + 2h`).
6. Adapter'da `updateAllowListChecker(ensChecker)`; token'da da checker'ı güncelle.
7. Gas ölç: checker çağrısı swap başına kaç gas ekliyor? `LEARNINGS.md`'ye yaz (jüri sorusu).

**Testler:** kayıtlı → izinli; expiry geçince (fork'ta `vm.warp`) → izinsiz; `unregister` → izinsiz;
isim transferi revert; checker değişimi sonrası Faz 2 testleri hâlâ geçiyor.

**UI:** `Identity` sekmesi — izin tablosu: Cüzdan | ENS adı | Swap | LP | kalan süre (canlı geri sayım).
`System` sekmesine "aktif checker" satırı.

**Bitti kriteri:** UI'da checker'ı Simple'dan ENS'e çevirince tablo ve swap sonuçları ENS'e göre değişiyor.

**Commit:** `feat(contracts): ens allowlist checker`, `feat(scripts): ensv2 registries setup`,
`feat(app): identity table with live expiry`

---

## Faz 4 — World ID attester ve HumanRegistrar

**Amaç:** Kaydı elle yapmak yerine: credential provider doğrular → otomatik, süreli, devredilemez
ENS kimliği. Bugünkü provider: World ID passport (gerçek kişi + geçerli belge, bir pasaport = bir cüzdan).
Önce backend'de `CredentialProvider` arayüzünü tanımla, World'ü onun ilk implementasyonu olarak yaz.

**Öğrenilecek kavram:** IDKit v4 akışı (RP imzası backend'de, proof client'ta, doğrulama Developer
Portal'da), `signal` ile proof'u cüzdana bağlama, nullifier ile tekrar kaydı engelleme, provider
soyutlamasının neden önemli olduğu (World attestation'ları geldiğinde tek modül eklenecek).

**Görevler**
1. **Kullanıcı yapar:** World Developer Portal'da app oluştur → `app_id`, `rp_id`, `signing_key`.
   Staging/simulator'ın passport credential'ını destekleyip desteklemediğini test et
   (desteklemiyorsa World booth'una sor, alternatif: gerçek pasaport + World App).
2. `HumanRegistrar.sol`: `onlyAttester`; `registerHuman(wallet, nullifierHash, expiry, tiers)`;
   `usedNullifier[nullifierHash]` kontrolü; iki registry'de `register(...)`; event yayınla.
   Registry'lerde `ROLE_REGISTRAR`'ı issuer'dan HumanRegistrar'a taşı.
3. `/api/rp-signature`: `signRequest` (server-side key).
4. `/api/verify`: IDKit sonucunu Developer Portal `/api/v4/verify/{rp_id}`'ye ilet; environment kontrolü;
   signal == seçili cüzdan kontrolü; nullifier'ı 256-bit sayı olarak normalize et; attester key ile
   `registerHuman` tx'i gönder; tx hash'i döndür.
5. Tier kuralı (basit tut): doğrulanan herkes SWAP; LP için ayrı bir "LP başvurusu" düğmesi (issuer onayı)
   veya ikisini birden ver — plan aşamasında kullanıcıyla karar ver.

**Testler:**
- Foundry: aynı nullifier ikinci kez → revert; attester dışı çağrı → revert.
- API: sahte/bozuk proof → 400; signal uyuşmazlığı → 400.
- UI (elle): Alice doğrular → kimlik gelir → swap geçer. Aynı pasaportla Bot'u kaydetmeye çalış →
  "Bu pasaport zaten kullanıldı". Kullanıcı iptal ederse (IDKit cancel) → net mesaj.

**UI:** `Identity` sekmesine "Pasaportunla doğrula" akışı (QR / deep link), adım adım durum göstergesi:
proof alındı → portal doğruladı → nullifier kontrol → ENS kaydı tx → tamamlandı.

**Bitti kriteri:** Uçtan uca: QR okut → 30 sn içinde izin tablosunda yeşil satır → swap geçiyor.
Sybil denemesi reddediliyor. Başarısız yollar görünür.

**Not:** `LEARNINGS.md`'ye World debrief için süre ve sürtünme notlarını mutlaka yaz.

**Commit:** `feat(contracts): human registrar with onchain nullifiers`, `feat(api): idkit verify + attester`,
`feat(app): passport verification flow`

---

## Faz 5 — Issuer konsolu ve denetim kaydı

**Amaç:** Venue operator'ın (TSV) kolları — iptal, pozisyon kapatma, **trading halt** — ve kamuya
açık denetim kaydı. Halt, SEC şartına doğrudan karşılık gelir: dayanak hissede borsa durursa venue
de aynı anda durmalı.

**Öğrenilecek kavram:** `unwindPosition` (varlıkların önce sahibine dönmesi, dönemezse issuer'a),
`updateSwappingEnabled` ile halt, ENS event'lerinden denetim izi çıkarma.

**Görevler**
1. `Issuer` sekmesi (UI başlığı: "Venue operator"): kimliği iptal et (iki registry'de `unregister`),
   LP pozisyonunu unwind et, **"Trading Halt"** (açıklama: "Dayanak hissede işlem durdu — venue de durur")
   ve "Resume". Her buton tx hash + sonuç gösterir.
2. `Audit` sekmesi: `LabelRegistered`, `LabelUnregistered`, `ExpiryUpdated` (ENS registry'ler),
   `HumanRegistrar` event'leri ve PermissionedHooks `Swap` event'lerinden zaman çizelgesi.
   (viem `getLogs`; block aralığını deploy bloğundan başlat.)

**Testler:** unwind sonrası Alice USDC'sini geri alıyor; iptal sonrası swap revert; pause sırasında tüm swap'lar revert.

**Bitti kriteri:** UI'dan iptal → Alice'in swap'ı anında başarısız; unwind → bakiye değişimi görünür;
audit log'da tüm olaylar sıralı.

**Kesme:** Süre yoksa sadece iptal + audit log; unwind ve pause'u sonra ekle.

**Commit:** `feat(app): issuer console`, `feat(app): audit timeline from onchain events`

---

## Faz 6 — Agent delegasyonu (ENS hiyerarşisi)

**Amaç:** Doğrulanmış bir insanın, kendi kimliği altında trading bot'una **sınırlı** yetki vermesi:
bot swap yapabilir, LP olamaz; insanın kimliği iptal edilince bot da düşer.

**Öğrenilecek kavram:** Name başına subregistry, name-scope roller, yetki zinciri (parent geçerliliği).

**Görevler (önce plan modunda tasarımı kullanıcıyla netleştir — iki seçenek sun)**
- Seçenek A (ENS-yerel): İnsan için on-demand bir UserRegistry proxy'si, `bot.<human>.swap.tnvda.eth`;
  HumanRegistrar `agentParent[agent] = human` indeksini tutar; checker: agent kaydı geçerli VE parent
  geçerli → sadece SWAP.
- Seçenek B (sade): `agents.tnvda.eth` registry'si, label = agent adresi; parent bilgisi HumanRegistrar'da.
- Hangi rollerin kime gerektiğini (`ROLE_SET_SUBREGISTRY` vb.) ABI ve docs'tan çıkar, riskleri yaz.

**Testler:** bot swap geçer; bot LP revert; parent iptal → bot swap revert; bot'un kendi kaydı iptal → revert.

**UI:** `Identity` tablosunda Alice'in altında girintili bot satırı; "Bot'a yetki ver" düğmesi;
`scripts/bot.ts` basit trading bot'u (her N saniyede küçük swap, sonucu loglar).

**Bitti kriteri:** Demo adım 4 ve 5 UI'dan tek tıkla çalışıyor.

**Commit:** `feat(contracts): agent delegation via ens subregistry`, `feat(app): delegate to agent`

---

## Faz 7 — Demo modu, deploy, teslim dosyaları

**Amaç:** Sahnede hatasız, 3 dakikalık, anlaşılır demo + tüm teslim şartları.

**Görevler**
1. `Demo` sekmesi — adım adım "stepper", her adımda tek "Çalıştır" düğmesi ve canlı sonuç:
   1. Problem: SEC 17 Eylül kararnamesi — TSV'ler erişim standartlarını belirlemek zorunda;
      katılımcılar işlem için yetkilendirilmiş olmalı (kısa alıntı: `docs/refs/sec-innovation-exemption.md`)
   2. Alice pasaportla doğrulanır → ENS mührü → swap ✅
   3. Stranger swap dener → ❌ (sebep ekranda)
   4. Aynı pasaportla ikinci cüzdan → ❌ (bir belge = bir mühür)
   5. Alice bot'a yetki verir → bot swap ✅, bot LP ❌
   6. Venue operator Alice'i iptal eder → Alice ❌, bot ❌; unwind → USDC geri döner; köşede 2 dk'lık test
      kimliğinin süresi dolar → ❌
   7. **Trading Halt:** "Nasdaq NVDA'da işlemi durdurdu" → operator halt'a basar → herkesin swap'ı ❌ →
      Resume → ✅ (SEC şartı: dayanak durursa venue de durur)
   8. Audit log: "her yetki, iptal ve halt onchain'de — kamuya bildirim şartının kaynağı"
2. "Demo'yu sıfırla" script'i (yeni aktörler, taze 2 dk'lık kimlik).
3. Frontend'i Vercel'e deploy et (ENS canlı demo şartı); env'leri ayarla.
4. README: tek cümle özet, mimari diyagram, kontrat adresleri, **Uniswap entegrasyonunun dosya+satır
   referansları**, kurulum/test komutları, takım.
5. `FEEDBACK.md` (Uniswap) ve `docs/WORLD_DEBRIEF.md` — `LEARNINGS.md`'den derle. Uniswap formunu doldur.
6. Demo videosu (yedek) — ekran kaydı, 2-3 dk.
7. **Güçlü tavsiye (Uniswap ana hedef):** `uniswap-ai` reposuna küçük PR — permissioned-pools
   plugin'ine "ENSv2 tabanlı allowlist checker" örneği/skill'i. README ve FEEDBACK.md'de linkle.

**Bitti kriteri:** Demo sekmesi baştan sona iki kez üst üste hatasız çalışıyor. Canlı link açık. Tüm teslim
dosyaları repoda.

**Commit:** `feat(app): guided demo mode`, `docs: readme, feedback, world debrief`, `chore: deploy`

---

## Jüri soruları için hazır cevaplar (kısa)
- "Bu sistem neyi önlüyor?" → CLAUDE.md Bölüm 1'deki dört madde: kağıt üstündeki kural, bayat yetki,
  sınırsız delegasyon, izsiz yönetim. Başka bir şey iddia etme.
- "KYC yerine mi?" → Hayır. KYC "kimi tanıyorum" sorusunu cevaplar; biz "kim, ne zaman, hangi yetkiyle
  işlem yapabilir" sorusunu onchain yönetiyoruz. KYC sağlayıcısı da bir credential provider olarak takılabilir.
- "Neden basit bir mapping değil?" → Süre dolumu, devredilemezlik, EAC rol ayrımı (backend ekler, issuer
  siler), hiyerarşik delegasyon ve standart event'ler — mapping ile hepsi sıfırdan yazılır ve başka
  uygulamalar okuyamaz. Faz 6'yı canlı göster.
- "World ne işe yarıyor?" → Bugün: gerçek kişi + geçerli belge + bir belge = bir kimlik. Provider arayüzü
  sayesinde World attestation'ları (yaş, vatandaşlık) geldiğinde tek modül eklenir.
- "Güveni taşıdınız mı?" → Backend sadece ekleyebilir (ROLE_REGISTRAR), silemez; issuer iptal eder.
- "Bu DeFi mi, DeFi'yi kısıtlamıyor musunuz?" → Hayır. Permissionless havuzlara dokunmuyoruz. SEC'in
  kendisi de bu kararnamenin DeFi hakkında olmadığını söylüyor. Hanko, regüle venue'ların Uniswap v4
  altyapısını kullanabilmesi için erişim katmanı.
- "SEC şartlarının hepsini karşılıyor musunuz?" → Hayır, ve iddia etmiyoruz. Erişim yetkisi, halt, LP
  ayrımı, açık kontratlar ve kamuya açık kayıt: evet. Hacim/sembol limitleri, issuer itiraz kaydı: roadmap.
- "Gas?" → Faz 3'te ölçülen gerçek rakam.
