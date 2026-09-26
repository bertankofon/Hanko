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

## Faz 2 — Permissioned pool: adapter, havuz, likidite, swap

**Ne yaptık.** Kendi MockUSDC'miz (6 decimals), PermissionsAdapter, tNVDA/USDC havuzu
(fee 3000, tickSpacing 60, 200 USDC/tNVDA), Alice'in tam aralık pozisyonu, ve UI'dan gerçek
swap. 16 fork testi + Sepolia deploy.

**Fazın en değerli hamlesi:** kod yazmadan önce Uniswap'in kendi entegrasyon testlerini
(`v4-periphery/test/hooks/permissionedPools/`) okumak. Kurulum sırasının yazılı olduğu tek yer
orası ve iki kritik detay sadece orada:

1. **Token allowlist'i beş protokol adresi istiyor**, sadece adapter değil: PoolManager,
   PermissionedPositionManager, UniversalRouter, factory, hook. Eksik olsa her wrap bizim
   `RecipientNotAllowed` hatamızla patlar ve sebep Uniswap tarafında aranırdı.
2. **`depositForVerification(amount)`** diye özel bir fonksiyon var; düz transfer yerine bu
   kullanılmalı (önce `approve`). Factory doğrulamadan önce bakiyeye bakıyor, fonksiyon ayrıca
   filtrelenebilir `VerificationDeposit` event'i yayınlıyor.
3. **PoolManager'ın kendisi de `allowedWrapper` olmalı** — CLAUDE.md'de yoktu.

### Sürprizler

- **Currency sıralaması adapter'ın adresine bağlı ve factory düz CREATE kullanıyor.** Upstream
  testleri bunu adapter'ı doğru adres çıkana kadar döngüde yeniden yaratarak çözüyor; biz iki
  sıralamayı da destekleyip `sqrtPriceX96`'yı gerektiğinde ters çevirmeyi tercih ettik. Ters
  çevirmeyi unutmak 1e12 kat yanlış ama "çalışıyor gibi görünen" bir havuz veriyor — bu yüzden
  test fiyatı tam sayı USDC olarak geri okuyor.
- **Likidite eklerken permissioned tarafta permit2 kullanılmıyor:** LP underlying'i önce
  position manager'a gönderiyor, sonra `SETTLE(currency, OPEN_DELTA, payerIsUser=false)` ile
  posm kendi bakiyesinden ödüyor. Adapter token'ı hiçbir katılımcının cüzdanında duramadığı için
  başka yolu yok.
- **Swap tarafında permit2 gerekiyor:** router `_payPermissionedFromPayer` ile
  `permit2.transferFrom` çağırıyor. İki onay zinciri: token→permit2, permit2→router.
- **Router iç hatayı sarmalıyor.** Reddedilen swap `WrappedError(hook, beforeSwap.selector,
  0x82b42900, …)` olarak geliyor; viem ABI'sini bilmediği selector'ü isimlendiremiyor. UI'daki
  çözücü hatanın içindeki tüm hex bloklarını tarayıp bizim selector'lerimizi arıyor.
- **PermissionedPositionManager'da Sepolia'daki ilk pozisyon bizimki** (`tokenId = 1`).

### Test yazarken iki tuzak (Foundry)

- `vm.expectRevert` **bir sonraki çağrıya** bağlanıyor. Fonlama transfer'i araya girerse test
  yanlış sebeple geçer. Fonlamayı ayrı yardımcıya çıkardık.
- `vm.prank` ile hedef çağrı arasına giren herhangi bir dış okuma prank'i tüketiyor. Plan'ı
  `vm.prank`'ten önce hesaplamak gerekti.

### Ölçüm

`checkAllowlist` çağrısı: **warm 668 gas, cold 2.668 gas, ortalama 1.918**. Bir swap toplam
~215.000 gas (UI'dan gerçek tx). Checker swap başına birkaç kez çağrılıyor (router ödeme,
router çekme, hook), yani izin katmanının maliyeti kabaca **swap'ın %2-4'ü**. Faz 3'te ENS
checker'ı ile aynı ölçüm tekrarlanacak; asıl kıyas o.

### Sepolia adresleri (Faz 2)

| | |
|---|---|
| PermissionsAdapter | `0x7060947614ECED6CA376A318C81dF6C088f00718` |
| MockUSDC | `0xB30c9206F2747f122A3AB2924a537193eCB623fa` |
| poolId | `0x7fa0ce83de5a3d08be5dcb359c65283ba15be677f30fb1d1b7640d4fc3aaf765` |
| LP pozisyonu | tokenId 1, sahibi Alice |

## Faz 3 — ENSv2 ve EnsAllowlistChecker

**Ne yaptık.** `tnvda.eth` kaydı, üç UserRegistry proxy'si (`tnvda` / `swap` / `lp`),
`EnsAllowlistChecker`, canlı checker değişimi ve Identity sekmesi. 29 yeni test (toplam 52).

**Kavram.** İzin artık bir mapping satırı değil, bir isim: `<adres>.swap.tnvda.eth`. Üç özellik
kod yazmadan ENS'ten geliyor — süre dolumu (`findOwner` süresi geçmiş isimde `address(0)`
döndürüyor), devredilemezlik (`roleBitmap = 0`), ve ekleme/silme yetkilerinin ayrılığı
(`ROLE_REGISTRAR` vs `ROLE_UNREGISTER`). Dördüncüsü Faz 6'nın temeli: isimler iç içe geçiyor.

### Sürprizler

1. **Commitment, subregistry adresini de bağlıyor.** `makeCommitment`'ta `address(0)`,
   `register`'da gerçek registry verince hash tutmuyor ve hata `CommitmentTooOld` olarak geliyor —
   "commitment yok" demek istiyor ama "çok eski" diyor. İsmi boş alıp sonra
   `setSubregistry` ile bağladık.

2. **`makeAddr("alice")` adresinin Sepolia'da gerçekten kodu var** (~23 byte, muhtemelen o meşhur
   test anahtarıyla yapılmış bir EIP-7702 delegasyonu). ENS isimleri ERC-1155 token olduğu için
   mint sırasında alıcıya `onERC1155Received` çağrılıyor ve fork testleri patlıyor. Çözüm: fork
   seçildikten **sonra** `vm.etch(addr, "")`. Constructor'da yapmak işe yaramıyor, fork state'i
   üzerine yazıyor.

3. **`vm.prank` tuzağı ikinci kez.** `revokeName` içindeki `findTokenId` okuması prank'i tüketti,
   çağrı test kontratından gitti. Artık refleks: prank ile hedef çağrı arasına hiçbir dış okuma
   koyma, ya da `startPrank` kullan.

4. **Sepolia'nın txpool'u doldu** (`-32003: txpool is full`) ve script'in son üç işlemi düştü.
   Simülasyon başarılı göründüğü için log'lar "admitted" yazdı ama zincire gitmedi. Bu yüzden
   `AdmitMembers` idempotent yazıldı — tekrar çalıştırınca eksikleri tamamlıyor, var olanda
   revert etmiyor. **Ders:** çok işlemli deploy script'leri kısmi başarıya dayanıklı olmalı.

5. **`forge script` simülasyonu son bloğun zaman damgasına bakıyor**, o da gerçek saatin ~30 sn
   gerisinde. Commit/reveal beklemesi bu yüzden 60 değil ~90 sn sürdü.

### Ölçüm — jürinin soracağı rakam

Aynı rota, aynı miktar, gerçek Sepolia swap'ları:

| Checker | swap gas | `checkAllowlist` (ort.) |
|---|---|---|
| Mapping (Simple) | 215.010 | 1.918 |
| ENS | 272.640 | 39.310 |
| **Fark** | **+57.630 (+%27)** | |

Yorum: ENS okuması bir proxy'ye delegatecall + string hash + soğuk storage okuması demek ve
swap başına birkaç kez çağrılıyor. %27 ucuz değil ama bunun karşılığında süre dolumu,
devredilemezlik, yetki ayrılığı ve hiyerarşik delegasyon bedava geliyor — mapping ile hepsi
elle yazılır ve başka uygulamalar okuyamaz.

### Sepolia adresleri (Faz 3)

| | |
|---|---|
| tnvda.eth registry | `0x2462d01326F42ccfDbcC6358e2c8B4fd157Ea7fC` |
| swap.tnvda.eth | `0xbB8A0C79945993eCf1ACd4177B896A75C2998dce` |
| lp.tnvda.eth | `0xA35983B2b124e34AC65e77F4c854a3a356274A55` |
| EnsAllowlistChecker | `0x9d4f612f25f18FA6eAE1700c6e8Fb92aD35b7806` |

Kira: 8 ENS-USDC / yıl. Havuz artık ENS okuyor; `SwitchChecker` ile tek işlemde mapping'e geri
dönülebiliyor.

## Faz 6 — Agent delegasyonu (projenin ENS kalbi)

**Ne yaptık.** Alice kendi kayıt defterini aldı, bot'a onun içinde bir isim verdi, ve bot havuzda
Sepolia'da gerçek bir swap yaptı. Alice iptal edilince bot **kendiliğinden** durdu. 12 yeni test
(toplam 64).

### Kurulumdan önce kaynaktan doğrulanan üç varsayım

1. `getSubregistry` süresi dolmuş isimde `address(0)` döndürüyor —
   `_isExpired(entry.expiry) ? 0 : entry.subregistry`.
2. **`unregister` de aynı sonucu veriyor:** `entry.expiry = block.timestamp` yazıyor ve
   `_isExpired` `>=` ile bakıyor, yani iptal aynı işlemde etkili. İptal zincirini elle yazmaya
   gerek kalmadı.
3. `ROLE_SET_SUBREGISTRY` transfer hakkı açmıyor (ayrı nybble). Alice kendi defterini asabiliyor
   ama ismi hâlâ devredilemez.

### Tasarım: indeks bizim mapping'imizde değil, ENS'te

Uniswap checker'a sadece adres veriyor (`checkAllowlist(account, token)`), dolayısıyla bot'un
adresinden sahibini bulabilmek gerekiyor. Saf hiyerarşi bunu tek başına veremez — adresten
"hangi insanın defterine bakayım" sorusunun cevabı yok.

CLAUDE.md bu indeksi `HumanRegistrar` içinde bir `agentParent` mapping'inde tutmayı öneriyordu.
Onun yerine **ENS'in kendi alanına** koyduk: `agents.tnvda.eth` altında her agent için bir kayıt,
ve o kaydın **`subregistry` alanı** sahibinin defterini gösteriyor. Çözüm zinciri:

```
agents.tnvda.eth[bot].getSubregistry()  → Alice'in defteri   (bot'un kaydı iptal olursa 0)
Alice'in defteri.getParent()            → (swapRegistry, aliceLabel)
swapRegistry.findOwner(aliceLabel)      → Alice hâlâ yetkili mi?   ← zincir burada kopuyor
Alice'in defteri.findOwner(botLabel)    → bot'un izni duruyor mu?
```

Dört okuma, dördü de ENS'in zaten bildiği şeyler. **Kendi kontratımızda tek satır state yok.**

**İndeks yetki değil, işaretçi.** Birinin agent kaydını başkasının defterine yöneltmesi hiçbir şey
kazandırmıyor: son adımda o defterin içinde isim aranıyor ve o ismi sadece defterin sahibi
verebiliyor. Test: `test_indexEntryAloneGrantsNothing`.

**Yetki ayrılığı burada da var:** venue işaretçiyi yazar (`agents.tnvda.eth`'te `ROLE_REGISTRAR`
operatörde), yatırımcı ismi verir (kendi defterinde `ROLE_REGISTRAR` onda). Hiçbiri diğerinin
yarısını yapamıyor. Alice bot'unu venue'ya sormadan geri alabiliyor (`undelegate`).

### Sürpriz

`setSubregistry` ile defteri asmak yetmiyor — **geri bağlantı (`setParent`) da kurulmalı.**
`getParent()` sadece `setParent`'ın yazdığını okuyor, ebeveynin `setSubregistry`'sinden
türetilmiyor. Kurmayınca checker "bu defter kimin?" sorusunu cevaplayamıyor ve tüm agent zinciri
sessizce çalışmıyor. İlk testlerde tam olarak bu oldu.

### Ölçüm

| Yol | swap gas |
|---|---|
| Mapping checker | 215.010 |
| ENS, doğrudan isim (Alice) | 272.640 |
| ENS, agent zinciri (Bot) | 349.123 |

Agent çözümü doğrudan isme göre ~76k daha pahalı — dört ek ENS okuması. Karşılığında delegasyonun
iptali için ayrı bir mekanizma yazmak gerekmiyor.

### Sepolia adresleri (Faz 6)

| | |
|---|---|
| agents.tnvda.eth | `0x385C90b1613D30706828380133bfdC3D61A49107` |
| Alice'in kendi defteri | `0xBA8daFac04175cbc3cD25d596046F9B71cFf169b` |
| EnsAllowlistChecker (agent'lı) | `0xC26f633Dd7BD41bE832c132104149714f0ef00FB` |

## Faz 5 — Venue operator konsolu ve Audit

**Ne yaptık.** Halt/Resume, iptal ve unwind düğmeleri; zincirden okunan bir zaman çizelgesi.
3 yeni test (toplam 67).

### Sürprizler

1. **Alchemy ücretsiz planı `eth_getLogs`'u 10 blokla sınırlıyor.** Bizim geçmiş ~2.000 blok,
   yani 200 ayrı çağrı gerekirdi. Denenen alternatifler: publicnode (rate limit), drpc (10.000
   blok, çalışır). Sonunda **Etherscan API**'sine geçtik — zaten anahtarımız var, sınırı yok ve
   bonus olarak **zaman damgası** döndürüyor, o yüzden satırlarda blok numarası yerine gerçek
   saat yazıyor.

2. **Etherscan 5 istek/sn ile sınırlı ve paralel çektiğimizde bir kısmı sessizce düşüyordu.**
   İlk halinde `swap.tnvda.eth` kayıtlarının tamamı listede yoktu ve sayfa bunu hiç belli
   etmiyordu — bir denetim sayfası için en kötü hata türü. Sıralı çekime geçtik ve okunamayan
   kaynak olursa sayfa "bu liste eksik" diyor. **Kural: audit yüzeyi sessizce eksik veri
   göstermemeli.**

3. **İptal → yeniden kayıt, delegasyonu sessizce koparıyor.** `unregister` sonrası `register`
   yeni bir entry yaratıyor; yeni entry'nin `subregistry`'si boş ve rolleri sıfır. Yani Alice'i
   iptal edip geri alınca kendi defterine bağlantısı kopuyor, bot da çözülmüyor. Script bunu
   görünce defteri yeniden deploy etmeye çalışıp revert ediyordu (aynı salt, aynı adres).
   Düzeltme: defterin adresi `deployments`'a yazılıyor ve varsa **yeniden deploy etmeden geri
   bağlanıyor**. Demo günü "iptal et, sonra geri al" dediğimizde tam olarak bu patlardı.

4. **`unwindPosition` canlı test edilmedi** — havuzun tek pozisyonunu kapatır ve demoyu bozardı.
   Fork testleriyle doğrulandı: pozisyon kapanıyor, iki varlık da LP'ye dönüyor, operatör dışında
   kimse çağıramıyor, ve **iptal edilmiş bir LP bile parasını geri alabiliyor** (iptal ≠ el koyma).

### Audit'in kaynakları

`swap` / `lp` / `agents` registry'leri (LabelRegistered, LabelUnregistered), adapter
(SwappingEnabledUpdated, AllowListCheckerUpdated), hook (Swap), position manager
(CurrencyUnwound). Hepsi Etherscan üzerinden, deploy bloğundan itibaren.

Sayfanın üstünde "bu sayfaya güvenmeyin" kutusu var: event'ler bizim tuttuğumuz log değil,
kontratların yaydığı kayıtlar; aynı listeyi uygulamamız çalışmadan da herkes çekebilir. İzinler
ENS isimleri olduğu için ENS'in kendi explorer'ında da görünüyorlar.
