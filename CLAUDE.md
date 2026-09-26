# CLAUDE.md — Hanko (ETHGlobal Tokyo 2026)

> **Hanko (判子):** Japonya'da belgeleri onaylayan kişisel mühür. Bu proje, tokenize hisse
> havuzları için issuer'ın verdiği, süreli, iptal edilebilir ve delege edilebilir onchain mühür.

> Bu dosya Claude Code'un proje hafızasıdır. Her oturumda baştan okunur.
> **Yeni bir oturuma başlıyorsan önce `docs/HANDOVER.md`'yi oku** — nerede kaldığımız,
> canlı adresler, alınmış kararlar ve tekrar düşmemen gereken tuzaklar orada.
> Ayrıntılı faz planı: `docs/PHASES.md`. Öğrenme notları: `docs/LEARNINGS.md`.

## 0. Nasıl çalışıyoruz (EN ÖNEMLİ BÖLÜM)

Kullanıcı (Berti) deneyimli bir Solidity/EVM geliştiricisi. Amaç sadece çalışan kod değil,
**her adımı anlayarak ve test ederek** ilerlemek. Bu yüzden:

1. **Dil:** Kullanıcıyla **Türkçe** konuş. Geri kalan her şey **İngilizce**: kod, yorumlar,
   commit mesajları, dosya isimleri, **UI metinleri**, CLI çıktısı, README ve teslim dosyaları.
   (Jüri ve sponsorlar repoya ve ekrana bakıyor; sadece sohbet Türkçe.)
   `docs/` altındaki iç notlar (LEARNINGS.md gibi) Türkçe kalabilir.
2. **Her faz aynı döngüyle ilerler:**
   1. **Plan:** Kod yazmadan önce fazın kavramını 5-10 cümleyle anlat (neyi, neden yapıyoruz,
      hangi kontrat neyi çağırıyor), dosya listesini ve test planını göster. **Onay bekle.**
   2. **Build:** En küçük çalışan dilimi yaz.
   3. **Test:** Önce Foundry testleri (unit + Sepolia fork), sonra UI'da elle kontrol.
   4. **UI:** Fazın sonucunu ilgili UI sekmesine ekle. Her sekmede bir "Ne oldu?" paneli olsun:
      son işlemin ne yaptığı, hangi kontratın hangi fonksiyonu çağrıldı, Etherscan linki.
   5. **Not:** `docs/LEARNINGS.md`'ye fazın özetini yaz: ne yaptık, neden, sürprizler,
      sürtünme noktaları, eksik dokümantasyon. (Bu dosya sonunda FEEDBACK.md ve World debrief'e dönüşecek.)
   6. **Commit + push:** Küçük, anlamlı commit'ler (conventional commits). Tek dev commit YOK —
      sponsorlar commit geçmişine bakıyor. **Her fazın sonunda `git push` at** (remote:
      `bertankofon/Hanko`, public). Push öncesi `.env` türevlerinin ve RPC anahtarının
      takip edilmediğini doğrula.
   7. **Dur:** Fazın "bitti kriterleri"ni ve kullanıcının UI'da deneyeceği test listesini yaz, sonra dur.
3. **Tahmin etme, doğrula:** ABI'leri, adresleri ve fonksiyon imzalarını ezbere yazma.
   Resmi deployment dosyalarından veya kaynak koddan al (bkz. Bölüm 4). Emin değilsen söyle.
4. **Hard-coded sahte değer yok:** UI'daki her durum zincirden okunmalı. ENS jürisi bunu kontrol ediyor.
5. **Gizli anahtarlar asla client'a gitmez:** World RP signing key ve attester private key sadece
   server-side (Next.js API route) kullanılır.
6. **Kapsam disiplini:** `docs/PHASES.md`'deki kesme çizgilerine uy. Yeni bir fikir çıkarsa önce sor.

## 1. Proje tek cümlede

Tokenize bir hisse (tNVDA) için kurulan Uniswap v4 **Permissioned Pool**'a erişim, issuer'ın
kontrol ettiği **ENSv2 kimlikleriyle** yönetilir: süreli, devredilemez, anında iptal edilebilir,
agent'lara sınırlı yetkiyle devredilebilir ve her değişiklik onchain kayıtlıdır.
Kimliğin verilmesi için bir "credential provider" gerekir; bugün bu World ID (gerçek kişi +
geçerli pasaport), ileride World'ün attestation'ları veya bir KYC sağlayıcısı olabilir.

### Çekirdek: bu sistem neyi önlüyor? (DÜRÜST TANIM — pitch buna sadık kalmalı)
1. **Kağıt üstündeki kuralı:** Bugün tokenize menkul kıymet kısıtları çoğu yerde kullanım
   şartlarında yazıyor. Bizde kural her swap ve LP işleminde kodla uygulanıyor.
2. **Bayat yetkiyi:** Erişim süresi dolunca veya issuer iptal edince yetki anında düşer
   (ve bağlı agent'larınki de). Mapping tabanlı allowlist'lerde bu elle ve hataya açık.
3. **Sınırsız delegasyonu:** Bir yatırımcı trading bot'una sadece swap yetkisi verebilir,
   LP yetkisi veremez; yetki insanın yetkisine bağlıdır.
4. **İzsiz yönetimi:** Her yetki verme/iptal/süre dolumu onchain event; denetim izi hazır.

**İddia ETMİYORUZ:** KYC'nin yerini aldığımızı, "gizli menkul kıymet" sunduğumuzu,
vatandaşlık/yaş doğruladığımızı (World'de bu attestation'lar henüz kullanılamıyor).

**Pitch:** SEC 17 Eylül 2026'da tokenize hisseleri permissioned AMM havuzlarına bağladı.
Bu havuzların kalbi "kim, ne zaman, hangi yetkiyle işlem yapabilir" sorusu. Biz bu soruyu
ENSv2 ile onchain, süreli, iptal edilebilir ve delege edilebilir hale getirip Uniswap'in
Permissioned Pools standardına takılabilir bir checker olarak paketledik.

**Hedef ödüller (öncelik sırasıyla):** ENS (Best Use of ENSv2), Uniswap (Best Uniswap Stack
Contribution), World (Best Use of IDKit — ikincil, ama başarısız yol + debrief şartlarını yine karşıla).

### Regülasyon bağlamı (ayrıntı: `docs/refs/sec-innovation-exemption.md`)
SEC'in 17 Eylül 2026 "Innovation Exemption" kararnamesi, TSV'leri (Tokenized Securities Venue)
iki işle tanımlar: permissioned katılımcılar için AMM havuzları sağlamak ve bu havuzlara
**erişim standartlarını belirlemek**. Hanko ikinci işin onchain katmanıdır. Özellik eşlemesi:
| SEC şartı | Hanko karşılığı |
|---|---|
| Katılımcılar işlem için yetkilendirilmiş olmalı | Swap/LP mühürleri (ENSv2 kayıtları) |
| Dayanak hissede borsa durursa TSV de aynı anda durmalı | Issuer konsolunda **Trading Halt** (`updateSwappingEnabled(false)`) |
| LP'ler ayrı bir muafiyet kategorisi | Ayrı LP mührü (`LIQUIDITY_ALLOWED`) |
| Kontratlar denetlenebilir, açık, public ledger'da | Açık kaynak, Sepolia/Ethereum |
| Operasyonlar hakkında kamuya bildirim | Audit sekmesi (onchain event'ler) |

**Rol isimlendirmesi:** Kodda `issuer` kalabilir, ama UI ve sunumda bu rol
**"Venue operator (TSV)"** olarak anılır. Demoda tokenize eden ve venue'yu işleten aynı taraftır.
**Kapsam dışı (roadmap olarak an, kodlama):** sembol/hacim limitleri, dayanak hisse issuer'ının
itiraz hakkı kaydı, halt'ın bir oracle ile otomatikleşmesi.
**Karıştırma:** Kararnamedeki **5 yıl muafiyetin kendi ömrü** (SEC kalıcı kuralları yazana kadarki
geçici pencere). Katılımcı izninin süresiyle ilgisi yok — kararname bireysel yetki süresi hakkında
hiçbir şey söylemiyor. Bizim süre seçimimiz bu yüzden SEC'e dayandırılamaz; **doğru dayanak
credential'ın kendi geçerliliği** (pasaportun bitiş tarihi, KYC yenileme döngüsü). Faz 4'te
`CredentialProvider.verify` döndürdüğü `expiry` bu işi devralacak.
**Hanko DeFi'yi kısıtlamaz:** permissionless havuzlar etkilenmez; Hanko regüle venue'ların
Uniswap v4 altyapısını kullanabilmesi içindir.

## 2. Mimari

```
[Kullanıcı] --IDKit (passport)--> [Next.js API: /api/verify]
                                        |  1) World Developer Portal ile proof doğrula
                                        |  2) attester key ile tx gönder
                                        v
                                [HumanRegistrar.sol]  (attester dışında kimse çağıramaz)
                                        |  - nullifier daha önce kullanıldı mı? (onchain)
                                        |  - ENS register(label=wallet hex, owner=wallet, expiry)
                                        v
             [ENSv2 UserRegistry: swap.tnvda.eth]   [ENSv2 UserRegistry: lp.tnvda.eth]
                                        ^
                                        | findOwner(label) (view)
                              [EnsAllowlistChecker.sol]  (IAllowlistChecker + ERC165)
                                        ^
                                        | checkAllowlist(account, token)
      [Uniswap PermissionsAdapter (tNVDA)] <-> [PermissionedHooks] <-> [PoolManager]
                                        ^
                  [UniversalRouter v2.2]  /  [PermissionedPositionManager]
```

### Kontratlar (`contracts/`, Foundry)
- `MockStockToken.sol` (tNVDA): ERC-20. Issuer mint eder. Transferde alıcı ya sistem adresi
  (adapter vb., issuer'ın tuttuğu küçük liste) ya da checker'a göre izinli olmalı.
- `SimpleAllowlistChecker.sol`: Faz 1-2 için geçici checker (owner flag set eder). Havuzu ENS'ten
  bağımsız ayağa kaldırmak için.
- `EnsAllowlistChecker.sol`: Asıl checker. Swap registry'de kayıt → `SWAP_ALLOWED (0x1)`,
  LP registry'de kayıt → `LIQUIDITY_ALLOWED (0x2)`. Faz 6'da agent yolu eklenir.
- `HumanRegistrar.sol`: ENS registry'lerde `ROLE_REGISTRAR` tutan tek kontrat. Sadece attester
  EOA çağırabilir. Kullanılmış nullifier'ları onchain tutar (bir pasaport = bir cüzdan + denetim izi).
  Kayıtta hangi credential provider'ın kullanıldığını (`providerId`, ör. `world-passport-v1`) event'e yazar.
- Backend'de **credential provider arayüzü**: `verify(request) → { ok, subjectId, expiry, providerId }`.
  Bugün tek implementasyon World ID passport. Mimari, World attestation'ları veya bir KYC sağlayıcısı
  geldiğinde sadece yeni bir provider eklenecek şekilde kurulur (jüriye gösterilecek).
- İptal: Issuer, registry'lerde `ROLE_UNREGISTER` tutar ve doğrudan `unregister` çağırır.
  (Yetki ayrılığı: backend ekler ama silemez; issuer siler.)

### Uygulama (`app/`, Next.js App Router + viem/wagmi + Tailwind)
- API routes: `/api/rp-signature`, `/api/verify` (attester burada), `/api/actors` (dev).
- **Actor switcher (sadece demo/dev):** Alice, Stranger, Bot, Issuer için burner key'ler
  server-side tutulur; UI'dan "şu aktör olarak işlem yap" denir. Sahnede MetaMask değiştirmekle
  uğraşmamak için. Opsiyonel olarak gerçek cüzdan bağlama da desteklenir.
- Sekmeler (her faz bir sekme ekler): `System` · `Pool` · `Identity` · `Issuer` · `Audit` · `Demo`.
- Adresler `deployments/<chainId>.json` dosyasından okunur (script'ler yazar, UI okur).

### Ağlar
- **Geliştirme:** Anvil ile Sepolia fork (`anvil --fork-url $SEPOLIA_RPC`). Hızlı, zaman ileri alınabilir.
- **Demo:** Sepolia (canlı demo linki ENS için şart). Her faz sonunda Sepolia'ya da deploy et.

## 3. Label ve gizlilik kararları
- ENS label = cüzdan adresinin küçük harfli hex'i (ör. `0x7a3f...`). İsim yok ("alice" yok).
  Adres zaten onchain görünür, ek bilgi sızmaz; checker adresten label'a doğrudan gider.
- Nullifier onchain tutulur. World nullifier'ları uygulama/action kapsamlıdır, uygulamalar arası
  bağlanamaz.
- World proof'unda `signal` = cüzdan adresi (proof o cüzdana bağlanır, backend aynı değeri zorunlu kılar).

## 4. Doğrulanmış adresler (Sepolia, 11155111) — KULLANMADAN ÖNCE Faz 0'da tekrar doğrula

### Uniswap (kaynak: `Uniswap/contracts` → `deployments/json/11155111.json`, bölüm `latest`)
| Kontrat | Adres |
|---|---|
| PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` |
| PermissionsAdapterFactory | `0xe6b0d96919334c33d06266d1420f97f6f434fa2b` |
| PermissionedHooks | `0x51247e2291d290d17c08813a175ac86465ede8c0` |
| PermissionedPositionManager | `0x864c37908aa5e10b100cacee1c62e3954d76f5e1` |
| UniversalRouter **v2.2** | `0x5093f1cded83d99ffed6602da6260672ae16787c` |

⚠️ Varsayılan `UniversalRouter` anahtarı v2.1.2'yi gösterir (`0x7E4f…43f3`). Permissioned swap için
**v2.2 şart**. Router'ın içindeki permissions adapter factory değerinin yukarıdaki factory ile
eşleştiğini onchain'den oku.

Kaynak kod: `Uniswap/v4-periphery` → `src/hooks/permissionedPools/` (PermissionsAdapter,
PermissionsAdapterFactory, PermissionedPositionManager, PermissionedV4Router,
interfaces/IAllowlistChecker.sol, libraries/PermissionFlags.sol).
⚠️ **PermissionedHooks v4-periphery'de DEĞİL** — `Uniswap/v4-hooks-public` →
`src/permissioned-pools/PermissionedHooks.sol` (v4-periphery'den 15daba8b ile çıkarılmış).
Factory herkese açık: `createPermissionsAdapter(token, owner, checker)` ve
`verifyPermissionsAdapter(adapter)` (adapter bakiyesi > 0 olmalı).
Faz 0'da doğrulanan imzalar: router/hook/posm üçü de `PERMISSIONS_ADAPTER_FACTORY()` getter'ını
taşıyor; factory `POOL_MANAGER()`, `permissionsAdapterOf(address)`,
`verifiedPermissionsAdapterOf(address)` sunuyor. `PermissionFlag` tipi `bytes2`:
`SWAP_ALLOWED = 0x0001`, `LIQUIDITY_ALLOWED = 0x0002`, `ALL_ALLOWED = 0xFFFF`.

### ENSv2 (kaynak: `ensdomains/contracts-v2` @ `366de741187e38686c904242753c532b7de70d47`,
`contracts/deployments/sepolia/*.json`, deploy tarihi 2026-09-15)
| Kontrat | Adres |
|---|---|
| RootRegistry | `0x9703dbd26dab89504490994138cf2c575251a9ce` |
| ETHRegistry | `0x657ea849311d3d5823348dded7c2aaafb3ede09e` |
| ETHRegistrar | `0xabe76f6c8dfced81aa5a2bb8034202a7136b94ca` |
| VerifiableFactory | `0x9e726eb570beb6bceb495ab8cda7df517d4e841c` |
| UserRegistryImpl | `0xa80338aaa8d23831cea25e858d1774534abb0263` |
| PermissionedResolverImpl | `0x14f09fd05d4585759e54844dc9b00147131cf243` |
| UniversalResolverV2 | `0x5d25c1d6acbb71b7a28aa7899618a3412a8303e3` |
| UniversalHelper | `0x33f571aa8a160a21b877cf6e0fb8806692b97df5` |
| MockUSDC | `0x16f95d91dba7da3aca778ec053df0ff6c6a8aa8e` |
| Universal Resolver proxy (sabit) | `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` |

⚠️ `main` branch'teki Sepolia dosyaları ESKİ (Haziran) deployment'ı gösterir. Commit'i kullan.
⚠️ ENS, Sepolia stack'ini birkaç kez yeniden deploy etti; bir "hackathon deployment" da olabilir.
Kontrol: `cast call 0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe "ROOT_REGISTRY()(address)"`
→ `0x9703…a9ce` bekleniyor. **Faz 0'da doğrulandı: eşleşiyor**, yani 15 Eylül deployment'ı canlı
ve ENS booth'una sorulacak bir şey yok. (Ayrıca: sabit proxy doğrudan UniversalResolverV2'ye
değil, `ManagedUniversalResolverProxy` `0x6d80F217…e6F1` üzerinden bağlanıyor.)
ABI'leri bu JSON dosyalarından al (her dosya tam ABI içerir). İlgili fonksiyonlar (doğrulandı):
`register(string,address,address,address,uint256,uint64)`, `unregister(uint256)`,
`findOwner(string) view`, `getState(uint256) view`, `grantRootRoles`, `revokeRoles`,
`setSubregistry`, `initialize(tuple[] grants)`; VerifiableFactory `deployProxy(impl,salt,data)`.

## 5. Ortam değişkenleri (`.env`, asla commit etme)
```
SEPOLIA_RPC_URL=
ETHERSCAN_API_KEY=
DEPLOYER_PRIVATE_KEY=        # issuer da bu olabilir
ATTESTER_PRIVATE_KEY=        # sadece server
ACTOR_ALICE_PK= ACTOR_STRANGER_PK= ACTOR_BOT_PK=   # sadece demo/dev
WORLD_APP_ID=  WORLD_RP_ID=  WORLD_RP_SIGNING_KEY=  # Developer Portal'dan
WORLD_ENV=staging|production
```

## 6. Sık hatalar (bunları kontrol et)

> Faz 2'de doğrulandı. Kurulum sırasının tek yazılı kaynağı Uniswap'in kendi entegrasyon
> testleri: `v4-periphery/test/hooks/permissionedPools/…::setUpPermissionsAdapter`.
> Sıra kodda `contracts/src/PermissionedPoolWiring.sol`'de; script ve testler onu çağırır.

- **Token allowlist'ine BEŞ protokol adresi girer, sadece adapter değil:** adapter, PoolManager,
  PermissionedPositionManager, UniversalRouter v2.2, PermissionsAdapterFactory, PermissionedHooks.
  Hepsi bir noktada underlying'e dokunuyor. Eksik olursa wrap bizim `RecipientNotAllowed`
  hatamızla patlar ve sebep Uniswap tarafında aranır — yanlış yerde saat kaybı.
- **Doğrulama için düz transfer değil `depositForVerification(amount)` kullan** (önce `approve`).
  Factory doğrulamadan önce adapter'ın bakiyesine bakıyor; bu fonksiyon ayrıca filtrelenebilir
  bir `VerificationDeposit` event'i yayınlıyor. Sıra: approve → depositForVerification →
  `verifyPermissionsAdapter`.
- Yeni adapter'da swap **varsayılan olarak kapalı** → `updateSwappingEnabled(true)`.
  (Aynı anahtar Faz 5'teki Trading Halt.)
- Adapter admin (imzalar iki argümanlı): `updateAllowedWrapper(PoolManager, true)`,
  `updateAllowedWrapper(router v2.2, true)`, `updateAllowedWrapper(permissioned posm, true)`,
  `updateAllowedHook(PermissionedHooks, true)`. **PoolManager'ın da wrapper olması gerekiyor.**
- PoolKey currency'si **underlying token değil, adapter adresi**.
- **Currency sıralaması adapter'ın adresine bağlı ve factory düz CREATE kullanıyor** — adapter
  deploy edilene kadar tNVDA'nın hangi tarafa düşeceği bilinmiyor. İki sıralamayı da destekle ve
  `sqrtPriceX96`'yı birinde ters çevir. Sessiz 1e12 hatası çalışan bir havuz gibi görünür;
  fiyatı geri okuyup test et.
- Adapter token'ını PoolManager dışında kimse tutamaz; transfer denemesi `InvalidTransfer` verir.
- ENS label'ları küçük harf olmalı (normalizasyon).

## 7. Teslim zorunlulukları (unutma)
- Uniswap: public repo, `FEEDBACK.md`, feedback formu (https://developers.uniswap.org/hackathon-feedback),
  README'de checker/hook entegrasyonunun dosya+satır referansları.
- World: IDKit ile çalışan uygulama, server-side doğrulama, başarılı + başarısız yol,
  integration debrief (ilk başarıya süre, sürtünme, eksik doküman, en etkili tek iyileştirme).
- ENS: ENSv2 Sepolia, merkezi kullanım, hard-coded değer yok, canlı demo linki, açık kaynak.
- Genel: düzgün git geçmişi, demo videosu (yedek).
