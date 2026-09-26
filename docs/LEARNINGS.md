# LEARNINGS.md

Her fazın sonunda: ne yaptık, neden, sürprizler, sürtünme noktaları, eksik dokümantasyon.
Faz 7'de `FEEDBACK.md` (Uniswap) ve `docs/WORLD_DEBRIEF.md` bu dosyadan derlenecek.

## Faz 0 — Kurulum, doğrulama, System sekmesi

**Ne yaptık.** pnpm monorepo (`contracts/` Foundry, `app/` Next.js, `scripts/`, `deployments/`),
Foundry 1.8.3 kurulumu, dış adreslerin pinlenmesi, tek bir doğrulama modülü
(`scripts/lib/checks.ts`) ve bunu hem CLI'dan (`pnpm verify`) hem System sekmesinden çalıştırma.

**Neden tek modül.** Kontrol tanımları iki yere kopyalansa er geç birbirinden ayrılır ve
"UI yeşil ama script kırmızı" durumuna düşeriz. `@hanko/verify` workspace paketi TypeScript
kaynağını export ediyor, Next `transpilePackages` ile derliyor.

### Sürprizler

1. **PermissionedHooks v4-periphery'de değil.** `src/hooks/permissionedPools/` altında
   PermissionsAdapter, PermissionsAdapterFactory, PermissionedPositionManager,
   PermissionedV4Router ve interface'ler var ama hook yok — v4-periphery `15daba8b` ile
   çıkarılmış. Hook `Uniswap/v4-hooks-public` reposunda
   (`src/permissioned-pools/PermissionedHooks.sol`). Adresi `Uniswap/contracts`
   deployment JSON'unda, kaynağı başka bir repoda olması aramayı yavaşlattı.

2. **Hook adresi kendi izinlerini kodluyor ve bu offline kontrol edilebilir.**
   `Uniswap/contracts` içindeki `PermissionedHooksDeployer.sol`, salt'ın
   `uint160(hook) & Hooks.ALL_HOOK_MASK == 0x28c0` verecek şekilde önceden madenlenmesi
   gerektiğini yazıyor (beforeInitialize | beforeAddLiquidity | beforeSwap | afterSwap).
   Deployed adres bunu sağlıyor. Zincire hiç gitmeden yanlış hook adresini yakalayan
   bedava bir kontrol.

3. **Üç ayrı kontrat aynı getter'ı taşıyor.** UniversalRouter v2.2 (V4SwapRouter üzerinden),
   PermissionedHooks ve PermissionedPositionManager — hepsinde
   `PERMISSIONS_ADAPTER_FACTORY()` (selector `0xab769d37`). Üçünün de aynı factory'yi
   göstermesi Faz 2'nin ön koşulu ve tek çağrıyla doğrulanabiliyor. Üçü de doğrulandı.

4. **`PermissionFlag` bir `bytes2`,** `uint8` değil. Değerler `0x0001` / `0x0002`.
   Faz 1'de checker'ı yazarken tip önemli.

5. **ENS sabit proxy'si iki katmanlı.** `0xeEeE…EeEe` (UpgradableUniversalResolverProxy)
   doğrudan UniversalResolverV2'ye değil, `ManagedUniversalResolverProxy`
   (`0x6d80F217…e6F1`) üzerinden bağlanıyor. İlk kontrolümüz tek atlama varsaydığı için
   kırmızı yandı — hata deployment'ta değil bizim beklentimizdeydi. Kontrol iki adıma bölündü.

6. **`ROOT_REGISTRY()` doğrulandı.** `0x9703…a9ce` bekleniyordu, aynısı geldi. CLAUDE.md'deki
   "ENS stack'i yeniden deploy edilmiş olabilir" riski gerçekleşmemiş; ENS booth'una
   soracak bir şey yok. 15 Eylül deployment'ı (`366de74`) canlı.

7. **`tnvda.eth` müsait.** Faz 3'ten önce alınma riski var; kontrol her çalıştırmada tekrarlanıyor.

8. **ETHRegistrar commit/reveal istiyor.** `commit(bytes32)` → `MIN_COMMITMENT_AGE` bekle →
   `register(string,address,bytes32,address,address,uint64,address,bytes32)`. Faz 3'te tek
   tx değil iki tx ve bir bekleme var; script'i buna göre kur.

### Sürtünme noktaları

- **GitHub API rate limit** deployment dosyalarını listelemeyi engelledi; `git clone --filter=blob:none`
  ile pinli commit'e checkout yapmak daha hızlı ve tekrarlanabilir çıktı.
- **`universal-router` deployment JSON'undaki commit (`e34ba78`) public klonda yok.**
  İmzaları `543e1a1`'de okuduk; bu fark `deployments/11155111.json` içinde kayıtlı.
  Uniswap için geri bildirim: deployment kaydındaki commit'in public repoda erişilebilir olması gerek.
- **Permissioned Pools için tek bir "buradan başla" sayfası yok.** Adres kaynağı `Uniswap/contracts`,
  kod kaynağı iki ayrı repo (`v4-periphery` + `v4-hooks-public`), hook'un salt gereksinimi
  ise sadece deployer kütüphanesinin yorumunda yazıyor. Bu üçünü birbirine bağlayan bir README
  saatler kazandırırdı → `FEEDBACK.md` maddesi.

### Faz 0 çıktısı

31+ kontrolün tamamı geçti; `unknown` yok. Kalan kırmızılar yalnızca `.env`'de henüz
doldurulmamış anahtarlar. `Hanko kontratları` kartı Faz 1'i bekliyor (`pending`).

## Faz 1 — tNVDA ve SimpleAllowlistChecker

**Ne yaptık.** `IAllowlistChecker`'ı en basit haliyle dolduran bir checker (owner'ın elle yazdığı
mapping) ve aynı checker'a soran transfer kısıtlı bir ERC-20 (tNVDA). 23 Foundry testi, anvil
fork provası, Sepolia deploy, ve `Pool` sekmesinin ilk hali.

### Sürprizler

1. **`BaseAllowlistChecker` zaten var.** v4-periphery `src/hooks/permissionedPools/` altında
   ERC-165'i doğru kuran bir abstract kontrat duruyor; kendi ERC-165'imizi yazmaya gerek yoktu.
   Dosya adı `BaseAllowListChecker.sol` ama kontrat adı `BaseAllowlistChecker` — küçük/büyük L
   farkı, import ederken bir kez yaktı.

2. **`PermissionFlag` sadece `|`, `&` ve `==` operatörlerini tanımlıyor; `!=` yok.**
   `flags != NONE` derlenmiyor, `!(flags == NONE)` yazmak gerekiyor. Tip `bytes2`, `uint8` değil.

3. **`require(cond, CustomError())` via-ir olmadan derlenmiyor** (solc 0.8.26).
   `if (!cond) revert CustomError();` yazdık.

4. **Anvil fork'u forklanan zincirin id'sini bildiriyor.** Deploy script'i ilk provada gerçek
   Sepolia `deployments/11155111.json` dosyasının üzerine fork adreslerini yazdı. Yedekten geri
   alındı; script'e `DEPLOYMENTS_SUFFIX` eklendi, fork çalıştırmaları `11155111-local.json`'a
   yazıyor. **Genel ders:** fork ve gerçek ağ ayrımını chainId'ye bırakma.

5. **Forge `.env`'i kendi proje kökünden okuyor.** Repo kökündeki `.env` görünmüyordu;
   `contracts/.env -> ../.env` sembolik linki ile çözüldü.

6. **Etherscan anahtarı reddedildi** (`invalid API key`) ve `--verify` preflight'ı deploy'u hiç
   başlatmadan durdurdu — iyi ki, yarım deploy olmadı. Kontratlar doğrulamasız deploy edildi;
   Etherscan V2 anahtarı gelince `forge verify-contract` ile sonradan doğrulanacak.

7. **React server action'dan sonra formu sıfırlıyor.** `useActionState` + `action={formAction}`
   kullanınca aktör seçimi her simülasyondan sonra varsayılana dönüyordu — sahnede kötü görünürdü.
   Submit'i elle yönetip state'i tek kaynak yaptık.

### Tasarım kararları

- **Sadece alıcı kontrol ediliyor, gönderen değil.** Yetkisi düşen biri pozisyonunu hâlâ
  dışarı gönderebilmeli; iptal varlıkları kilitlememeli. Faz 5'teki unwind buna dayanıyor.
- **Mint de kontrolden geçiyor**, yani issuer yetkisiz birine yeni hisse basamıyor.
- **Burn yolu yok**, dolayısıyla `_update`'te `to == address(0)` istisnası da yok. Eklenirse
  istisna da eklenmeli — kod içinde not düşüldü.
- **`systemAllowed`**: adapter gibi protokol adresleri katılımcı değil, kasa. Muafiyet olmasa
  her wrap revert ederdi.
- **UI'daki simülasyon** gerçek tx değil `eth_call`; anahtar ve gaz gerektirmeden aynı custom
  error'ı döndürüyor. Gerçek tx'ler Faz 2'de router üzerinden.

### Sepolia adresleri (Faz 1)

| Kontrat | Adres |
|---|---|
| MockStockToken (tNVDA) | `0x301b61f063fc6232D21cdFa5D97042910ee3994F` |
| SimpleAllowlistChecker | `0xc229c68F0C22301d3b332e0EAEfB3a93ebbe683D` |

deployBlock 11785312 · deploy maliyeti ~0.0036 ETH
