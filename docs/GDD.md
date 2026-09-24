# Matematico — Dokument Projektu Gry (GDD)

**Wersja:** 0.1 (szkic do akceptacji)
**Data:** 2026-09-24
**Status:** czeka na akceptację rodzica — **bez kodu gry**

---

## 0. O tym dokumencie

### 0.1. Legenda etykiet

Dokument miesza dwa rodzaje zdań:

- **Decyzje projektowe** („walka trwa 3–6 zadań”, „cyfra 0 jest rzadka”). To wybory, nie twierdzenia o świecie, więc **nie mają etykiet**. Można je zmienić jednym zdaniem rodzica.
- **Twierdzenia o świecie** (o dzieciach, nauce, sprzęcie, przeglądarce). Mają etykiety:

| Etykieta | Znaczenie |
|---|---|
| **[FAKT]** | źródło podane w tym dokumencie (sekcja 26); przy literaturze dodatkowo głębokość: **[ABSTRAKT]** / **[PEŁNY TEKST]** / **[WTÓRNE]** |
| **[MECHANIZM]** | wniosek z logiki/budowy systemu, bez danych empirycznych; pewność 1–6 |
| **[HIPOTEZA]** | możliwe wyjaśnienie, testowalne; pewność 1–6 |
| **[ZAŁOŻENIE]** | przyjęte bez weryfikacji; do sprawdzenia |
| **[NIESPRAWDZONE]** | wiedza ogólna, której nie zweryfikowałem narzędziem w tej sesji |

Skala pewności: 1 zgadywanie · 2 pojedyncza słaba przesłanka · 3 spójne rozumowanie, brak danych · 4 dane pośrednie · 5 mocne, powtarzalne dane · 6 trudne do zakwestionowania.

Wszystkie źródła literaturowe w tym dokumencie są na poziomie **[ABSTRAKT]** lub **[WTÓRNE]** — nie czytałem pełnych tekstów.

### 0.2. Zakres

Dokument opisuje całą grę docelową, ale szczegółowo rozpisuje tylko **MVP** (baza + Łąka + dungeon). Kolejne krainy są opisane na poziomie założeń.

---

## 1. Wizja i zasady projektowe

**Jednym zdaniem:** kolorowa, kostkowa przygoda, w której każde działanie matematyczne jest ruchem w grze — ciosem, blokiem, rzutem sieci albo kluczem do bramy.

**Gracz:** 8-latek, zna cztery działania, z przekroczeniem progu dziesiątkowego i bez. Gra ma **utrwalać i automatyzować**, a nie uczyć od zera.

### Zasady (w razie konfliktu wygrywa wyższa)

1. **Pomyłka uczy, nie karze.** Nie da się przegrać postępu. Zły wynik daje słabszy efekt i krótką podpowiedź.
2. **Matematyka jest mechaniką, nie bramką przed zabawą.** Każde zadanie coś robi w świecie gry.
3. **Sprzęt pomaga liczyć, nie liczy za dziecko.** Daje czas, podpowiedź na osi i jedną poprawkę — nigdy gotowego wyniku.
4. **Gra ma wyglądać na grę, nie na sprawdzian.** [HIPOTEZA, pewność 3] Program odbierany jako test może zwiększać porzucanie sesji u dzieci z lękiem przed testami — w badaniu Hilz i in. 2025 (piątoklasiści, n=890) uczniowie z lękiem przed testami matematycznymi częściej przerywali sesję w adaptacyjnym programie, a autorzy łączą to z odbiorem programu jako testu [FAKT][ABSTRAKT] (źródło [S9]).
5. **Uczciwość wobec dziecka.** Bez mikropłatności, bez loterii nagród za prawdziwe pieniądze, bez timerów „wróć za 4 godziny”.
6. **Rodzic ma kontrolę** nad zakresem liczb, limitem czasu i działaniami.

---

## 2. Platforma docelowa

| Parametr | Wartość | Etykieta |
|---|---|---|
| Urządzenie | Samsung Galaxy Tab S11 Ultra | — |
| Ekran | 14,6″, 2960×1848 px, Dynamic AMOLED 2X, 120 Hz | [FAKT] źródło [T1] |
| SoC / GPU | MediaTek Dimensity 9400+, GPU Immortalis-G925 | [FAKT] [T1] |
| RAM | 12 lub 16 GB | [FAKT] [T1] |
| Przeglądarka | Chrome na Androidzie | — |
| Wejście | pad Bluetooth (Gamepad API) + dotyk | — |
| Tryb | PWA: instalacja, pełny ekran, offline, orientacja pozioma | — |

**Wymagania techniczne wynikające z platformy:**

- **HTTPS jest obowiązkowy.** Chrome udostępnia Gamepad API tylko w bezpiecznym kontekście (HTTPS lub `localhost`) i wykrywa pad dopiero po naciśnięciu przycisku [FAKT][WTÓRNE] (źródła [T3], [T4]). Service worker (offline) też wymaga HTTPS [NIESPRAWDZONE]. Wniosek: hosting (do ustalenia) musi dawać HTTPS; testy na tablecie przez sieć LAN po zwykłym HTTP **nie zadziałają dla pada**.
- **Ekran startowy musi poprosić o naciśnięcie przycisku na padzie** („Naciśnij dowolny przycisk”), bo bez tego pad nie jest widoczny.

---

## 3. Pętla gry

```
            ┌───────────────────────────────────────────────────────┐
            ▼                                                       │
   ┌──────────────┐   łapanie    ┌──────────────┐                    │
   │   WYPRAWA    │─────────────▶│   STWORKI    │                    │
   │ (kraina 3D)  │  = zadania   │  (kolekcja)  │                    │
   └──────┬───────┘              └──────┬───────┘                    │
          │ powrót                      │ produkcja cyfr             │
          ▼                             ▼  (co cykl)                 │
   ┌──────────────┐  cyfry+działania ┌──────────────┐                │
   │     BAZA     │─────────────────▶│    BRAMA     │                │
   │ zagroda,     │                  │ „ułóż 54”    │                │
   │ skarbiec,    │                  └──────┬───────┘                │
   │ kuźnia       │                         │ otwarta                │
   └──────────────┘                         ▼                        │
          ▲                          ┌──────────────┐   ┌──────────┐ │
          │   sprzęt, cyfry          │   DUNGEON    │──▶│  ŁUP     │─┘
          └──────────────────────────│ walki QTE,   │   │ sprzęt,  │
                                     │ boss         │   │ cyfry    │
                                     └──────────────┘   └──────────┘
```

**Typowa sesja** (ok. 15–20 min [ZAŁOŻENIE]): wyprawa na Łąkę (1–2 stworki), powrót do bazy (zbiór cyfr, karmienie stworków), brama, dungeon (4–5 pokoi), łup.

**Cykl produkcji** = jeden powrót do bazy po wyprawie lub dungeonie, w którym padło co najmniej 1 zadanie. Produkcja **nie** działa w czasie rzeczywistym. Powód: [HIPOTEZA, pewność 3] liczniki czasu rzeczywistego zachęcają do kompulsywnego sprawdzania gry, a produkcja „za wyprawę” wiąże nagrodę z ćwiczeniem.

---

## 4. Świat i krainy

| Kraina | Działanie | Kategorie zadań (przykłady) | Etap |
|---|---|---|---|
| **Łąka** | dodawanie | do 10, dopełnianie do 10, podwajanie, do 20 bez przekroczenia, 3 składniki | **MVP** |
| Jaskinia | odejmowanie | w zakresie 10, do 20 bez przekroczenia, brakujący odjemnik | 3 |
| Wulkan | przekraczanie 10 | 8+7, 15−8, dwucyfrowe z przekroczeniem | 4 |
| Zamek | mnożenie | ×2, ×5, ×10 → ×3, ×4 → ×6–×9 | 5 |
| Lodowa Kraina | dzielenie | odwrotność tabliczki, dzielenie przez 2, 5, 10 → reszta | 6 |

Każda kraina to gotowa (generowana z ziarna, deterministyczna) wyspa z kostek: teren, woda, drzewa, punkty zainteresowania (legowiska stworków, skrzynie, brama do dungeonu). **Nie ma kopania ani stawiania bloków.**

**Boss krainy** łączy wszystkie kategorie tej krainy. Boss finałowy (po Lodowej Krainie) łączy wszystkie działania.

---

## 5. Silnik zadań

Czysty kod TypeScript, bez zależności od grafiki (sekcja 20). Wszystkie losowania używają deterministycznego generatora z ziarnem (testowalność).

### 5.1. Jednostki śledzenia

Dwa poziomy:

1. **Fakt** — konkretna para z tabliczki, np. `add:8+7`, `sub:15-8`, `mul:7x8`, `div:56:8`. Uniwersum: dodawanie a,b ∈ 1..10 (100 faktów), odejmowanie jako odwrotność dodawania (100), mnożenie 1..10 × 1..10 (100), dzielenie jako odwrotność mnożenia (100), dopełnianie do 10 (9). Razem ok. 410 faktów.
2. **Kategoria** — umiejętność, np. `add.within10`, `add.complement10`, `add.doubles`, `add.cross10`, `add.2digit.noCarry`, `add.2digit.carry`, `mul.t7`, `div.by8`. Fakt może należeć do kilku kategorii (`mul:7x8` → `mul.t7` i `mul.t8`).

Działania dwucyfrowe (34+25, 38+25) to za duże uniwersum, żeby śledzić każdą parę. Są śledzone **tylko na poziomie kategorii** z cechami (przeniesienie tak/nie, dziesiątki okrągłe tak/nie).

**Przemienność:** `7×8` i `8×7` to osobne fakty, ale odpowiedź na jeden aktualizuje drugi z wagą 50% [ZAŁOŻENIE — do weryfikacji na danych dziecka].

### 5.2. Formaty zadań

| Format | Gdzie | Wejście |
|---|---|---|
| **Wybór** z 3–4 opcji | walka, łapanie | przyciski A/B/X/Y lub dotyk |
| **Brakująca liczba** `8 + □ = 15` | obrona, łapanie Dopełniaka | wybór |
| **Układanie** z kafelków cyfr i działań | brama, kuźnia | przeciąganie / kursor pada |
| **Wpisywanie** na klawiaturze numerycznej w grze | brama (tryb alternatywny), blokada panelu rodzica | dotyk / pad |

### 5.3. Generowanie błędnych opcji (dystraktory)

Dystraktory mają być **wiarygodne** — takie, jakie dziecko mogłoby naprawdę policzyć źle. Reguły:

| Działanie | Dystraktory (przykład dla wyniku) |
|---|---|
| Dodawanie `8+7=15` | ±1 (14, 16), błąd przeniesienia (5), zamiana działania (1) |
| Dwucyfrowe `38+25=63` | ±10 (53, 73), zgubione przeniesienie (53), ±1 |
| Odejmowanie `15−8=7` | ±1 (6, 8), odwrócenie cyfr jedności (13) |
| Mnożenie `7×8=56` | sąsiedzi w tabliczce: 49 (7×7), 63 (7×9), 48 (6×8); pomylona para 54 (6×9); suma 15 |
| Dzielenie `56:8=7` | ±1 (6, 8), dzielnik zamiast ilorazu (8), inny iloraz z tabliczki |

Niezmienniki (sprawdzane testami właściwości): opcje są **różne**, **nieujemne**, **różne od poprawnej**, w rozsądnym zakresie; pozycja poprawnej odpowiedzi jest losowana równomiernie po przyciskach; opcje nie zdradzają odpowiedzi wzorcem (np. poprawna nie jest zawsze środkową liczbą).

### 5.4. Podpowiedzi po błędzie (strategie)

Po błędzie gra na ≤5 s (do pominięcia przyciskiem A) pokazuje **strategię** — nie tylko wynik. Wizualizacja: oś liczbowa ze skokami (dodawanie, odejmowanie) albo prostokąt z kostek (mnożenie, dzielenie — pasuje do stylu świata).

| Kategoria | Strategia | Przykład |
|---|---|---|
| dodawanie z przekroczeniem | dopełnij do 10 | 8+7 → 8+2+5 = 15 |
| prawie podwojenie | podwój i dodaj | 6+7 → 6+6+1 = 13 |
| dopełnianie | pary do 10 | 3 + □ = 10 → 3 i 7 to para |
| odejmowanie z przekroczeniem | zejdź do 10 | 15−8 → 15−5−3 = 7 |
| odejmowanie | dodawanie w górę | 15−8 → 8 + □ = 15 |
| ×9 | dziesięć razy minus raz | 9×7 → 70−7 = 63 |
| ×6 | pięć razy plus raz | 6×7 → 35+7 = 42 |
| ×4 | podwój podwojenie | 4×8 → 16 → 32 |
| przemienność | zamień czynniki | 3×8 → 8×3 |
| dzielenie | pomyśl o mnożeniu | 56:8 → 8 × □ = 56 → 7 |

Uzasadnienie: [FAKT][ABSTRAKT] w metaanalizie 40 badań nad feedbackiem w środowiskach komputerowych rozszerzony feedback (z wyjaśnieniem) miał większy efekt (0,49) niż samo „dobrze/źle” (0,05) i niż podanie poprawnej odpowiedzi (0,32), a efekty były większe dla matematyki (Van der Kleij i in. 2015, [S5]). Kontra z tego samego abstraktu: efekty były **mniejsze w szkole podstawowej i średniej**. Populacja tych badań to w dużej części starsi uczniowie i studenci, nie 8-latki (C4). [HIPOTEZA, pewność 3] podpowiedź-strategia pomoże 8-latkowi bardziej niż sam wynik; przeciw niej przemawia to, że 5 s tekstu/animacji może być pomijane — dlatego gra loguje, czy podpowiedź obejrzano do końca.

Po błędzie ten sam fakt **wraca po 2–4 innych zadaniach** (raz w sesji), a potem w następnej sesji.

---

## 6. Algorytm dopasowania trudności

### 6.1. Cele

1. Dziecko ma odpowiadać poprawnie w ok. **75%** zadań w walce — wyzwanie bez frustracji.
2. Częściej podsuwać **słabe** fakty i kategorie (niska skuteczność lub długi czas).
3. Wracać do opanowanych faktów rzadko, ale regularnie (powtórki rozłożone w czasie).
4. Mieszać kategorie (przeplatanie), a nie podawać 10 zadań tego samego typu pod rząd.

Podstawa celu 75%: [FAKT][ABSTRAKT] system Maths Garden (Klinkenberg i in. 2011, 3648 dzieci, >3,5 mln zadań) dobierał zadania ze średnim prawdopodobieństwem sukcesu 0,75, liczył wynik z poprawności i czasu odpowiedzi i raportował wysoką satysfakcję uczniów ([S7]). **Czego nie wiem:** to opis i walidacja systemu pomiarowego, nie eksperyment porównujący 0,75 z innymi progami — więc wartość 0,75 to [ZAŁOŻENIE] do strojenia na danych dziecka.

### 6.2. Stan przechowywany dla każdego faktu

| Pole | Opis |
|---|---|
| `m` | opanowanie 0..1 (średnia wykładnicza wyników prób) |
| `lt` | średnia wykładnicza log(czasu) poprawnych odpowiedzi |
| `n`, `nOk` | liczba prób, liczba poprawnych |
| `box` | pudełko Leitnera 0..5 |
| `lastSeen` | czas i numer sesji ostatniej próby |
| `helped` | ile razy rozwiązany z pomocą sprzętu |

Dla każdej kategorii: mediana czasu poprawnej odpowiedzi (**osobista norma dziecka**), średnie `m` faktów, trend z ostatnich 7 dni.

### 6.3. Wynik jednej próby `s ∈ [0,1]`

```
błąd lub brak odpowiedzi           → s = 0
poprawnie z pomocą (oś, poprawka)  → s = 0.5
poprawnie                          → s = 0.6 + 0.4 · szybkość

szybkość = clamp( (T_wolno − t) / (T_wolno − T_szybko), 0, 1 )
T_szybko = 0.8 × mediana_kategorii,  T_wolno = 2.5 × mediana_kategorii
```

Czas liczony jest od chwili, gdy opcje są widoczne **i** wejście odblokowane (blokada 300 ms przeciw przypadkowemu naciśnięciu). Jeśli karta przeglądarki była ukryta — próba jest odrzucana.

Progi czasu są **względne do dziecka**, nie do norm populacyjnych. Powód: nie mam zweryfikowanych norm czasu odpowiedzi dla polskich 8-latków [NIESPRAWDZONE], a względny próg nie wymaga ich znajomości.

Aktualizacja: `m ← m + α · (s − m)`. `α = 0.5` dla pierwszych 3 prób, potem `0.35` przy wpisywaniu i `0.25` przy wyborze z opcji — bo przy 4 opcjach trafienie zgadywaniem ma szansę 25% [MECHANIZM, pewność 6], więc poprawna odpowiedź z wyboru jest słabszym dowodem.

### 6.4. Koszyki i dobór zadania

| Koszyk | Warunek | Udział (domyślny) |
|---|---|---|
| W TOKU | 0.5 ≤ m < 0.8 | 40% |
| SŁABE | m < 0.5, n ≥ 1 | 25% |
| OPANOWANE | m ≥ 0.8, n ≥ 4, 2 ostatnie poprawne | 25% |
| NOWE | n = 0 | 10% (max 1 na 5 zadań) |

Szacowana skuteczność przy takich udziałach: 0.40·0.75 + 0.25·0.45 + 0.25·0.95 + 0.10·0.5 ≈ 0.70 [ZAŁOŻENIE: prawdopodobieństwa sukcesu w koszykach są przybliżone].

Algorytm doboru (pseudokod):

```
wybierzZadanie(pula, kontekst):
  koszyk = losujKoszyk(udziały skorygowane przez regulator)
  kandydaci = fakty z puli w tym koszyku
            − fakty widziane w 3 ostatnich zadaniach (poza zaplanowaną powtórką)
            − kategoria, która wystąpiła 2 razy pod rząd
  waga(f) = 1.0·(1 − m_f) + 0.5·zaległość(f) + 0.1
  zaległość(f) = clamp( (teraz − lastSeen_f) / interwał(box_f) − 1, 0, 2 )
  zwróć losowanie ważone z kandydatów
```

Interwały Leitnera: box 0 → ta sama sesja, 1 → następna sesja, 2 → 1 dzień, 3 → 3 dni, 4 → 7 dni, 5 → 14 dni. Poprawnie przy `m ≥ 0.6` → `box+1`; błąd → `box = max(0, box−2)`.

**Regulator** (okno 8 ostatnich zadań):

- skuteczność < 60% → +15 pp do OPANOWANYCH kosztem SŁABYCH i NOWYCH,
- skuteczność > 90% → +15 pp do SŁABYCH i NOWYCH,
- **2 błędy z rzędu** → następne zadanie na pewno z OPANOWANYCH („bezpiecznik frustracji”, [HIPOTEZA, pewność 3]).

### 6.5. Etapy trudności (warstwa narracyjna)

Pula faktów zależy od **etapu krainy** i ustawień rodzica. Adaptacja działa **wewnątrz** puli.

Łąka:

| Etap | Kategorie |
|---|---|
| Ł1 | dodawanie w zakresie 10 |
| Ł2 | + dopełnianie do 10, podwajanie do 5+5 |
| Ł3 | + dodawanie do 20 bez przekroczenia (12+5), podwajanie do 10+10 |
| Ł4 | + trzy składniki (4+6+3), dwucyfrowe bez przeniesienia (34+25) — jeśli rodzic ustawił zakres do 100 |

Etap odblokowuje się, gdy średnie `m` kategorii etapu ≥ 0.7 **albo** po pokonaniu bossa. Rodzic może włączyć „przekraczanie 10 już na Łące” — dziecko je zna, więc to może być potrzebne, żeby Łąka nie była za łatwa (sekcja 24).

### 6.6. Kalibracja startowa

Dziecko zna już wszystkie działania, więc zimny start od „1+1” byłby nudny. Na początku gry jest **„Próba Plusika”**: ok. 20 zadań (ok. 5 min) z czterech działań, bez limitu czasu, przedstawiona jako zabawa, nie test. Wyniki ustawiają startowe `m` całych kategorii i odblokowują etapy.

Wartości domyślne przed kalibracją [ZAŁOŻENIE]: do 10 → 0.6; przekroczenie 10 → 0.4; ×2, ×5, ×10 → 0.6; ×6–×9 → 0.35.

### 6.7. Przeplatanie — stan dowodów

- **Za:** [FAKT][ABSTRAKT] RCT w 54 klasach 7 (Rohrer i in. 2019): przeplatanie 61% vs blokowanie 38% w teście po miesiącu, d=0,83 ([S11]). Trzecioklasiści (n=236, Niemcy) z przeplataniem stosowali strategie odejmowania trafniej ([S12]). W grze edukacyjnej o tabliczce mnożenia (n=150) blokowanie dawało lepsze wyniki **w grze**, a przeplatanie — **poza grą** ([S13]).
- **Przeciw:** [FAKT][ABSTRAKT] dwa duże eksperymenty klasowe nie wykazały efektu przeplatania dla pojęć geometrycznych ([S14]); w klasie 4 nie było efektu rozłożenia ćwiczeń w czasie przy mnożeniu pisemnym ([S15]).
- **Populacja:** najsilniejsze wyniki dotyczą klas 7 (12–13 lat), nie 8-latków (C4).
- **Wniosek:** [HIPOTEZA, pewność 3] umiarkowane przeplatanie pomoże w utrwaleniu faktów u 8-latka. Koszt pomyłki jest niski (przeplatanie łatwo wyłączyć parametrem), więc przyjmuję je domyślnie.
- **Uwaga projektowa z [S13]:** przeplatanie może **obniżać wynik w grze** przy lepszym uczeniu się. Dlatego skuteczność w walce nie może być jedyną miarą postępu w panelu rodzica.

---

## 7. Walka (QTE w zwolnionym tempie)

### 7.1. Przebieg tury

1. **Tura gracza:** wybór akcji (menu 2–4 ikon).
2. **Zamach w zwolnionym tempie:** świat zwalnia do 10% prędkości, kamera robi zbliżenie, tło się przyciemnia i rozmywa.
3. **QTE:** duże działanie na środku, 3–4 odpowiedzi w **układzie rombu** odpowiadającym przyciskom pada (A dół, B prawo, X lewo, Y góra).
4. **Rozstrzygnięcie:** efekt zależy od wyniku (tabela 7.3). Po błędzie — podpowiedź (5.4).
5. **Tura wroga:** zapowiedź ataku (animacja zamachu, ikona „zwykły” / „mocny”) → QTE obrony.

Spokojne tło w QTE: [HIPOTEZA, pewność 2] bogata wizualnie gra może zwiększać lęk u dzieci z niższą wzrokowo-przestrzenną pamięcią roboczą. Podstawa: [FAKT][ABSTRAKT] 40 drugoklasistów, bez grupy kontrolnej, wzrost lęku u dzieci z niższą pojemnością tej pamięci ([S10]). Słabe dane, ale przyciemnienie tła nic nie kosztuje.

### 7.2. Akcje i działania

| Akcja | Docelowo (cała gra) | W MVP (Łąka) | Wymaga stworka |
|---|---|---|---|
| Atak prosty | dodawanie (8+7) | dodawanie do 10/20 | Plusik |
| Atak mocny | mnożenie (2×9) | podwajanie (7+7) | Bliźniak (Łąka) / Razik (Zamek) |
| Obrona | odejmowanie (9−3) | dopełnianie (6 + □ = 10) | zawsze dostępna; Dopełniak/Minusiak ją wzmacnia |
| Obrona przed mocnym atakiem | dzielenie (4:2) | trzy składniki (4+6+3) | zawsze dostępna; Koniczynek/Dzielnik ją wzmacnia |

Ataki **odblokowuje** stworek. Obrony są dostępne zawsze (nie można zostać bez obrony), a stworek daje +20% bloku i swój bonus.

Atak mocny ma **odnowienie 1 tury**, żeby dziecko mieszało akcje (i działania).

Opcja rodzica: **„Działania w walce: tematyczne krainy / wszystkie cztery”**.

### 7.3. Wynik a efekt

| Wynik | Atak | Obrona |
|---|---|---|
| Poprawnie, szybciej niż osobista mediana | 120% obrażeń („krytyk”) | 100% blok + kontra 5 obrażeń |
| Poprawnie | 100% | 100% blok |
| Poprawnie po upływie limitu | 70% | 60% blok |
| Błędnie | 30% + podpowiedź | 40% blok + podpowiedź |
| Brak odpowiedzi | 20% | 30% blok |

„Szybko” jest względne do mediany dziecka dla danej kategorii — bonus nie nagradza zgadywania, bo zgadywanie daje średnio mniej niż spokojne liczenie [MECHANIZM, pewność 5: przy 4 opcjach oczekiwana wartość zgadywania = 0.25·120% + 0.75·30% ≈ 52% < 100%].

### 7.4. Limit czasu (ustawia rodzic)

| Tryb | Działanie |
|---|---|
| **Brak** | zwolnione tempo trwa do odpowiedzi; brak wiersza „po limicie” |
| **Łagodny (adaptacyjny)** | limit = max(8 s, 2,5 × mediana dziecka dla kategorii) |
| **Stały** | rodzic podaje sekundy osobno dla + − × : |

Czas pokazany jest jako **powoli domykający się pierścień**, nie cyfry odliczania.

Stan dowodów o presji czasu:

- [FAKT][ABSTRAKT] 311 dzieci z klas 3–4: presja czasu zwiększała **stanowy** lęk w matematyce, ale związek lęku z wynikiem w matematyce był taki sam z presją i bez ([S3]).
- [FAKT][ABSTRAKT] 113 uczniów klas 4–5: jawne vs ukryte mierzenie czasu nie różniło lęku; większy lęk dawały trudniejsze zadania ([S2]); w drugiej analizie tej próby dzieci z trudnościami i wysokim lękiem radziły sobie lepiej przy jawnym mierzeniu czasu ([S4]).
- Często cytowany tekst Boaler (2014) „timed tests cause math anxiety” to **komentarz**, nie badanie z danymi [FAKT][ABSTRAKT] ([S1]).
- **Wniosek:** dane są mieszane, a populacje (klasy 3–5, testy szkolne) różnią się od sytuacji „QTE w grze”. Brak dowodu na szkodę ≠ dowód braku szkody.

**Rekomendacja domyślna:** tryb **Brak** podczas kalibracji i pierwszej wyprawy, potem **Łagodny**. Rodzic zmienia to w panelu.

### 7.5. Liczby (MVP)

| | Wartość |
|---|---|
| HP bohatera | 100 (+ pancerz) |
| Atak prosty / mocny | 10 / 18 obrażeń |
| Zwykły atak wroga / mocny | 15 / 25 obrażeń |
| Długość walki | 3–6 tur gracza, 6–10 zadań, ok. 2–3 min [ZAŁOŻENIE: 10–15 s na zadanie z animacją] |

**„Porażka” nie istnieje:** HP 0 → „Stworki cię ratują” — bohater wraca na początek bieżącego pokoju z pełnym HP, **wróg zachowuje zadane obrażenia**, boss zachowuje fazę. Postęp nigdy się nie cofa.

---

## 8. Łapanie stworków

1. Stworek chodzi po krainie (widoczny z daleka, charakterystyczny dźwięk).
2. Podejście + A (lub dotknięcie) → **zabawa stworka**, np. Plusik skacze po kamieniach-osi liczbowej.
3. Zadania z **kategorii stworka**:

| Rzadkość | Warunek złapania | Szansa na pojawienie się |
|---|---|---|
| Pospolity | 2 poprawne z 3 | stałe legowiska |
| Niezwykły | 3 poprawne z 4 | 1–2 miejsca na mapie |
| Rzadki | 3 poprawne z 4, zadania z górnego etapu kategorii | pojawia się po pokonaniu bossa, w konkretnym miejscu i porze dnia gry |

Łapanie jest **deterministyczne** (bez losowego „uciekł mimo dobrych odpowiedzi”). Nieudana próba → stworek chowa się w pobliżu i można spróbować po 1 minucie. Sieć daje dodatkowe próby (sekcja 12).

**Duplikaty** nie zapychają kolekcji: drugi Plusik = Plusik poziom 2 (więcej cyfr).

Za złapanie: 1 cyfra z puli stworka + wpis w „Liczbopedii”.

---

## 9. Baza i ekonomia cyfr

### 9.1. Baza (MVP)

Mała wyspa-obozowisko z kostek:

- **Zagroda** — stworki chodzą, dotknięcie pokazuje produkcję i przycisk „Nakarm”.
- **Skarbiec** — cyfry 0–9 z licznikami.
- **Kuźnia** — ulepszanie sprzętu za cyfry.
- **Tablica Wypraw** — wybór krainy (w MVP tylko Łąka).

### 9.2. Cyfry — rzadkość

| Poziom | Cyfry | Uzasadnienie |
|---|---|---|
| Pospolite | 1, 2, 3, 4, 5 | budulec |
| Niezwykłe | 6, 7, 8, 9 | większe liczby mniejszą liczbą cyfr |
| Rzadkie | 0 | pełne dziesiątki (10, 20, 50), bardzo „sprytne” rozwiązania |

Działania (+ − × :) **nie są zużywane**. Są odblokowywane na stałe przez typ stworka: Plusik → `+`, Minusiak → `−`, Razik → `×`, Dzielnik → `:`. W MVP: Plusik → `+`, Bliźniak → `×` (most do mnożenia: podwajanie = ×2).

### 9.3. Źródła (kranik)

**Produkcja na cykl** (poziom 1 / 2 / 3):

| Stworek | Produkcja |
|---|---|
| Plusik | 2 / 3 / 4 cyfry z {1..5} |
| Dopełniak | 1 / 1 / 2 **pary do 10** (np. 3 i 7) |
| Bliźniak | 1 / 1 / 2 **pary bliźniacze** (np. 6 i 6) |
| Koniczynek (rzadki) | poz. 1–2: 1 cyfra z {6..9} + **0 co drugi cykl**; poz. 3: dodatkowo 0 co cykl |

**Karmienie:** raz na cykl na stworka — 3 zadania z jego kategorii w bazie → +1 cyfra w tym cyklu. Powiązanie produkcji z ćwiczeniem.

**Inne źródła:** skrzynie w krainie (2–4 cyfry), łup z dungeonu, złapanie stworka (1 cyfra).

**Start:** 2× każda z 1–9 + 1× 0 (19 cyfr) oraz Plusik w prezencie.

### 9.4. Wydatki (odpływ)

1. **Brama** — zużywa cyfry z poprawnego rozwiązania (sekcja 10).
2. **Kuźnia** — ulepszenie sprzętu kosztuje „złóż sumę”: np. *„złóż 15 z trzech cyfr”* — dziecko wybiera z kolekcji 3 cyfry o sumie 15 (np. 9+5+1 albo 7+7+1). To kolejne ćwiczenie, a nie tylko wydatek.

### 9.5. Bilans (sprawdzenie rzędu wielkości)

- Przychód po złapaniu 3 stworków (poziom 1) + karmieniu: ok. 6–9 cyfr na cykl.
- Brama na Łące: 2–4 cyfry.
- Nadwyżka 3–6 cyfr/cykl → kuźnia.

[ZAŁOŻENIE] Liczby są do strojenia po pierwszych sesjach. Zasada, której **nie** stroimy: brak twardej blokady — patrz 10.4.

---

## 10. Brama do dungeonu

### 10.1. Zadanie

Brama pokazuje liczbę docelową, np. **„Ułóż 54”**. Dziecko układa wyrażenie z kafelków: cyfry ze Skarbca + odblokowane działania.

- Dwie sąsiednie cyfry tworzą liczbę dwucyfrową (5 i 4 → 54).
- MVP: **jedno działanie**, liczby maksymalnie dwucyfrowe (`a ∘ b`). Później: dwa działania z widocznymi nawiasami.
- Wyrażenie musi mieć co najmniej jedno działanie (samo „54” nie otwiera).

Przykład dla 54 (działania + i ×):

| Rozwiązanie | Zużyte cyfry | Ocena |
|---|---|---|
| 6 × 9 | 2 | **sprytne** (min. liczba cyfr, mnożenie) → bonusowa skrzynka |
| 50 + 4 | 3 | poprawne |
| 54 × 1 | 3 | poprawne (×1 nie liczy się jako „sprytne mnożenie”) |
| 27 + 27 | 4 | poprawne |

### 10.2. Ocena

- **Każde poprawne** rozwiązanie otwiera bramę.
- **Bonusowa skrzynka**, gdy: liczba zużytych cyfr = minimum możliwe z tym, co dziecko ma **albo** użyto mnożenia/dzielenia nietrywialnie (nie ×1, nie :1).
- **Gwiazdki za pomysłowość (opcjonalnie):** każde kolejne *inne* rozwiązanie tej samej bramy = gwiazdka (bez zużywania cyfr, tylko sprawdzenie). Uczy elastyczności.

### 10.3. Błędne wyrażenie

Nic nie jest zużywane. Brama pokazuje wynik ułożonego działania i odległość: *„Twoje działanie daje 48. Brakuje 6.”*

### 10.4. Generator bramy

1. Losuje cel z zakresu krainy (Łąka: 10–40; zakres do 100 → 10–99).
2. Preferuje cele, których sprytne rozwiązanie zawiera **słaby fakt** dziecka (np. 56, gdy słabe jest 7×8).
3. **Solver** (przegląd wszystkich `a ∘ b`, a,b ∈ 0..99 — ok. 40 tys. przypadków) sprawdza, że istnieje rozwiązanie z aktualnego Skarbca. Jeśli nie ma — brama daje **„dar bramy”** (brakujące cyfry). Gra nigdy nie blokuje postępu przez brak cyfr.
4. Solver liczy też minimum cyfr (do oceny „sprytne”).

### 10.5. Sterowanie układaniem

- **Dotyk:** przeciąganie kafelków z tacy na tor wyrażenia; dotknięcie kafelka na torze = zwrot.
- **Pad:** kursor po tacy (d-pad/gałka), A = połóż na końcu toru, X = cofnij ostatni, Y = sprawdź, B = wyjdź.
- Tryb alternatywny: **klawiatura numeryczna** w grze (wpisywanie).

---

## 11. Dungeon (MVP: „Nora pod Starym Dębem”)

5 pokoi, ok. 10–12 min [ZAŁOŻENIE]:

| # | Pokój | Zawartość |
|---|---|---|
| 1 | Wejście | walka: 1 wróg |
| 2 | Skarbiec | skrzynia zamknięta zadaniem (brakująca liczba) |
| 3 | Gniazdo | walka: 2 wrogów po kolei |
| 4 | Ognisko | pełne HP; krótka „lekcja stworka” — pokaz strategii dla najsłabszej kategorii dziecka |
| 5 | Sala bossa | boss |

Przy powtórnych wizytach: inna kolejność pokoi 1–3, wrogowie skalowani do etapu, nowy cel bramy.

---

## 12. Sprzęt

### 12.1. Zasada

Sprzęt daje jeden z trzech typów pomocy — **nigdy wynik**:

| Typ pomocy | Działanie | Wpływ na model dziecka |
|---|---|---|
| **CZAS** | +N s do limitu (przy limicie „Brak” — obniża próg „szybko” dla krytyka/kontry) | brak — to warunki, nie pomoc w liczeniu |
| **OŚ** | przycisk Y (raz na walkę na poziom przedmiotu): oś liczbowa z **pierwszym skokiem** strategii (np. 8 → 10), dziecko kończy samo | próba liczona jako „z pomocą” (s = 0,5) |
| **POPRAWKA** | po błędnym wyborze czas staje, pokazuje się podpowiedź, dziecko wybiera ponownie; efekt w walce = 80% | próba liczona jako „z pomocą” |

Do tego zwykłe statystyki (obrażenia, HP), żeby sprzęt był czuły w walce.

**Algorytm adaptacji widzi surowe wyniki** — sprzęt nie ukrywa słabych punktów przed modelem ani przed rodzicem.

### 12.2. Sloty

Broń · Pancerz · Sieć · Amulet. Poziomy 1–3 (kuźnia): więcej użyć na walkę / więcej sekund.

---

## 13. Zawartość Łąki (MVP)

### 13.1. Stworki

| Stworek | Rzadkość | Kategoria | Wygląd | Walka | Brama | Produkcja |
|---|---|---|---|---|---|---|
| **Plusik** | pospolity | dodawanie do 10 (Ł3: do 20) | zielony kostkowy zajączek, uszy w kształcie „+” | odblokowuje **atak prosty** | `+` | cyfry 1–5 |
| **Dopełniak** | pospolity | dopełnianie do 10, brakujący składnik | ślimak, muszla z 10 segmentów świecących po kolei | wzmacnia **obronę** (+20%) | — | pary do 10 |
| **Bliźniak** | niezwykły | podwajanie | dwa identyczne ptaszki-kostki | odblokowuje **atak mocny** „Podwójny dziób” | `×` | pary bliźniacze |
| **Koniczynek** | rzadki | trzy składniki, do 20 | czterolistna koniczyna na nóżkach, lekko świeci | wzmacnia **obronę przed mocnym atakiem** + tarcza pochłania 1 cios na walkę | — | 6–9 i **0** |

Koniczynek pojawia się dopiero po pokonaniu bossa (w nocy gry, przy starym dębie) — cel „po MVP” w obrębie MVP.

### 13.2. Przeciwnicy

| Wróg | HP | Zachowanie |
|---|---|---|
| **Kolczak** (kostkowy jeż) | 30 | co turę zwykły atak |
| **Trzmielak** | 25 | szybki: co drugą turę atakuje 2× (2 obrony po kolei) |
| **Grzybol** | 40 | co 3. turę **mocny atak** (dłuższa zapowiedź, świecący kapelusz) |

### 13.3. Boss: Chwastor, Król Chwastów

HP 120, trzy fazy (po 40 HP):

| Faza | Zadania | Mechanika |
|---|---|---|
| 1 | dodawanie do 10/20 | zwykłe ataki |
| 2 | podwajanie + dopełnianie | przywołuje 2 pnącza — każde „zwiędnie” po jednym poprawnym ataku |
| 3 | mieszane z całej Łąki | mocny atak co 2. turę |

Łup z bossa: **Złota Sieć** + **Amulet Drugiej Szansy** + 5 cyfr (w tym 1× 0).

### 13.4. Sprzęt Łąki

| Przedmiot | Slot | Statystyka | Pomoc | Skąd |
|---|---|---|---|---|
| Drewniany Miecz | broń | atak +0 | — | start |
| Miecz Słonecznika | broń | atak +3 | CZAS +2 s przy atakach | skrzynia w dungeonie |
| Kamizelka z Liści | pancerz | HP +0 | — | start |
| Pancerz Liczydło | pancerz | HP +20 | OŚ ×1 na walkę (obrona) | bonusowa skrzynka z bramy |
| Siatka z Trawy | sieć | — | — | start |
| Sieć Pajęcza | sieć | — | +1 próba przy łapaniu | skrzynia na Łące |
| Złota Sieć | sieć | — | +1 próba i OŚ ×1 przy łapaniu | boss |
| Amulet Drugiej Szansy | amulet | — | POPRAWKA ×1 na walkę | boss |

Skrzynie mają zawartość z **gwarancją** (np. każda 3. zwykła skrzynia daje przedmiot) — bez „pustych” losowań.

---

## 14. Sterowanie

### 14.1. Pad (standardowe mapowanie Gamepad API)

| Przycisk | Eksploracja | Walka (QTE) | Brama | Menu |
|---|---|---|---|---|
| Lewa gałka / d-pad | ruch | wybór opcji (alternatywa) | kursor na tacy | nawigacja |
| Prawa gałka | kamera (orbit) | — | — | — |
| A (dół) | interakcja / rozmowa / łapanie | odpowiedź „dół” | połóż kafelek | zatwierdź |
| B (prawo) | anuluj | odpowiedź „prawo” | wyjdź | wstecz |
| X (lewo) | — | odpowiedź „lewo” | cofnij kafelek | — |
| Y (góra) | mapa | odpowiedź „góra” / pomoc OŚ (w menu akcji) | sprawdź | — |
| LB / RB | — | poprzednia / następna akcja | przesuń tacę | zakładki |
| Start | pauza | pauza | pauza | — |

- **Układ przycisków** (Xbox / PlayStation / Nintendo) wykrywany z `gamepad.id` z możliwością ręcznej zmiany; ikony na ekranie zawsze pokazują właściwe symbole. [ZAŁOŻENIE] Nie wiem, jaki pad ma dziecko — pytanie w sekcji 24.
- Martwa strefa gałek 0,2; blokada 300 ms na wejście po pokazaniu QTE.
- Utrata połączenia z padem → automatyczna pauza i komunikat.

### 14.2. Dotyk

- **Eksploracja:** wirtualna gałka w lewej połowie ekranu (pojawia się pod palcem), przeciąganie po prawej = kamera, dotknięcie obiektu = interakcja (bohater podchodzi).
- **Walka:** 4 duże przyciski odpowiedzi w **tym samym rombie** co na padzie, w prawym dolnym rogu (zasięg kciuka przy trzymaniu tabletu); minimalny rozmiar 120×120 px CSS.
- **Brama:** przeciąganie kafelków.
- Gesty systemowe Androida przy krawędziach — elementy UI z marginesem ≥ 32 px od krawędzi [ZAŁOŻENIE].

### 14.3. Klawiatura (tylko do testów deweloperskich)

WASD/strzałki, spacja = A, 1–4 = odpowiedzi.

### 14.4. Wspólna warstwa wejścia

Wszystkie urządzenia mapują się na **akcje abstrakcyjne** (`move`, `confirm`, `cancel`, `answer(0..3)`, `pause`…). Logika gry nie wie, skąd przyszło wejście. Ostatnio użyte urządzenie decyduje, jakie podpowiedzi przycisków pokazuje UI.

---

## 15. UI/UX dla 8-latka

- Mało tekstu, duże ikony, **krótkie zdania** w kwestiach stworków. Opcja: czytanie działań i dialogów na głos (sekcja 25).
- Działanie w QTE: czcionka ≥ 72 px CSS, wysoki kontrast, cyfry o wyraźnych kształtach (bez 1 podobnego do 7).
- Kolor nigdy nie jest jedynym nośnikiem informacji (ikona + kolor).
- Pozytywny feedback krótki (0,5–1 s), nie przerywa rytmu. Błąd: brak czerwonych „X” na cały ekran, raczej „Prawie! Zobacz, jak to policzyć”.
- Pauza zawsze dostępna; wyjście z gry w dowolnym momencie zapisuje stan.

---

## 16. Styl graficzny i dźwięk

### 16.1. Styl

- **Świat z kostek**, inspiracja Minecraft/Roblox, ale **własne modele i paleta** (bez zasobów i znaków towarowych tych gier).
- Żywe, lekko pastelowe kolory; kolory w wierzchołkach + mały atlas tekstur 16×16 z filtrem „najbliższy sąsiad” dla detali.
- **Miękkie światło:** światło półkuli (niebo/ziemia) + jedno słońce kierunkowe; mapowanie tonów (AgX lub ACES) z lekkim podbiciem nasycenia.
- **Miękkie cienie w czasie rzeczywistym:** mapa cieni PCF od słońca, obszar wokół gracza. [FAKT][WTÓRNE] W nowszych wersjach three.js stała `PCFSoftShadowMap` jest przestarzała w ścieżce WebGL, a `PCFShadowMap` jest teraz miękka; zgłoszono też regresję jakości cieni PCF w r182 ([T2], [T5]). Wniosek: przypinamy wersję three.js i sprawdzamy cienie w Etapie 0.
- **Okluzja otoczenia w wierzchołkach** (klasyczne „gładkie oświetlenie” wokseli): ciemniejsze narożniki i styki kostek liczone raz przy budowie siatki. [MECHANIZM, pewność 5] daje to miękkie cienie kontaktowe prawie za darmo w czasie klatki.
- **Poświata (bloom)** tylko na elementach emisyjnych: oczy stworków, kryształy, cyfry łupu, brama.
- **Mgła w oddali** w kolorze horyzontu nieba — ukrywa granicę zasięgu i daje głębię.
- Postacie: sztywne części animowane proceduralnie (kiwanie, podskoki, jak w Minecrafcie) — bez szkieletów.
- Pora dnia gry (świt/dzień/zmierzch/noc) — zmienia kolory światła i mgły.

### 16.2. Dźwięk

Web Audio: muzyka pętlowa dla bazy/Łąki/dungeonu/bossa, dźwięki stworków, „dźwięk poprawnej odpowiedzi” zależny od serii (rosnąca wysokość). Osobne suwaki: muzyka, efekty, głos.

---

## 17. Wydajność i presety jakości

### 17.1. Założenia

- [MECHANIZM, pewność 4] GPU Immortalis (Mali) to architektura kafelkowa, w której każde pełnoekranowe przejście post-processingu kosztuje przepustowość pamięci; dlatego efekty łączymy w jedno przejście kompozycji, a bloom liczymy w połowie rozdzielczości.
- Natywna rozdzielczość 2960×1848 ≈ 5,5 Mpx [MECHANIZM, pewność 6: arytmetyka]. Renderowanie w natywnej rozdzielczości przez cały czas jest prawdopodobnie zbędne na ekranie 14,6″ z odległości ramienia [HIPOTEZA, pewność 3].
- Ekran ma 120 Hz, ale gra **celuje w stałe 60 fps** (pomijanie co drugiej klatki). [HIPOTEZA, pewność 4] mniejsze nagrzewanie i dłuższa bateria przy długich sesjach; do zmierzenia.

### 17.2. Presety

| Parametr | Niska | Średnia | Wysoka |
|---|---|---|---|
| Rozdzielczość renderu (vs natywna) | 50% | 70% | 90% |
| Dynamiczna rozdzielczość | tak | tak | tak |
| Cienie w czasie rzeczywistym | brak (AO wierzchołków + plamka cienia pod postaciami) | PCF 1024, obszar ~40 kostek | PCF 2048, większy promień miękkości, obszar ~64 kostki |
| Bloom | wył. | ½ rozdz. | ½ rozdz., więcej poziomów |
| SSAO | wył. | wył. | wł. w ½ rozdz. (jeśli zmieści się w budżecie) |
| Mgła | liniowa | wykładnicza | wykładnicza + wysokościowa |
| Zasięg widzenia | 48 kostek | 96 | 160 |
| Trawa/kwiaty (instancje) | 20% | 60% | 100% |
| Antyaliasing | FXAA | MSAA 4× | MSAA 4× |
| Cel | 60 fps (tryb oszczędny: 30) | 60 fps | 60 fps |

**Domyślnie:** krótki test (3 s sceny) przy pierwszym uruchomieniu wybiera preset; potem ręczny przełącznik w ustawieniach.

**Dynamiczna rozdzielczość:** czas klatki > 18 ms przez 2 s → skala −10% (min. 50%); < 12 ms przez 5 s → +5%.

### 17.3. Budżet (preset średni) — [ZAŁOŻENIE] do potwierdzenia pomiarami w Etapie 0

| Zasób | Budżet |
|---|---|
| Wywołania rysowania | ≤ 150 |
| Trójkąty widoczne | ≤ 400 tys. |
| Pamięć tekstur GPU | ≤ 64 MB |
| Sterta JS | ≤ 200 MB |
| Czas klatki: CPU / GPU | ≤ 6 ms / ≤ 12 ms |
| Pobranie pierwszego uruchomienia (gzip) | ≤ 5 MB |
| Start offline do menu | ≤ 3 s |

Techniki: teren w porcjach (np. 32×32×32) z łączeniem ścian („greedy meshing”) w Web Workerze; drzewa, kwiaty i trawa jako `InstancedMesh`; wspólne materiały; zasięg cieni tylko wokół gracza.

---

## 18. Panel rodzica

### 18.1. Blokada

Przytrzymanie ikony kłódki przez 2 s → działanie dla dorosłych do **wpisania**, np. `17 × 23 = ?` (dwucyfrowe × dwucyfrowe, losowe). To **nie jest zabezpieczenie**, tylko próg dla dziecka.

### 18.2. Postępy

- **Mapa ciepła tabliczki mnożenia** 10×10 i **tabeli dodawania** (kolor = opanowanie, ikona = wolno/szybko).
- **Top 10 słabych punktów** (fakty i kategorie), z trendem.
- Czas odpowiedzi w czasie (mediana per działanie, 7/30 dni).
- Skuteczność **poza walką** (łapanie, brama) obok skuteczności w walce (patrz uwaga w 6.7).
- Liczba sesji, łączny czas, liczba zadań; ile razy użyto pomocy sprzętu; czy podpowiedzi były oglądane.

### 18.3. Ustawienia

| Ustawienie | Wartości | Domyślnie |
|---|---|---|
| Zakres liczb | do 10 / do 20 / do 100 | do 20 |
| Działania włączone | + − × : (osobno) | wszystkie |
| Działania w walce | tematyczne krainy / wszystkie | tematyczne |
| Przekraczanie 10 na Łące | tak / nie | nie (do decyzji — sekcja 24) |
| Limit czasu QTE | Brak / Łagodny / Stały (s per działanie) | Brak → Łagodny po 1. wyprawie |
| Przypomnienie o przerwie | brak / 15 / 20 / 30 min | brak |
| Jakość grafiki | auto / niska / średnia / wysoka | auto |
| Zapis | eksport do pliku / import / reset | — |

---

## 19. Zapis

- **IndexedDB** (mała biblioteka opakowująca), zapis automatyczny po każdym zdarzeniu (złapanie, walka, brama, zmiana ustawień) i przy ukryciu karty.
- Prośba `navigator.storage.persist()` — mniejsze ryzyko usunięcia danych przez przeglądarkę [NIESPRAWDZONE: skuteczność na Chrome/Android].
- **Eksport/import do pliku JSON** w panelu rodzica — kopia zapasowa na wypadek wyczyszczenia danych Chrome.
- Schemat z polem `version` i łańcuchem migracji (testowanych).

Zawartość zapisu:

```
SaveV1 {
  version, createdAt, updatedAt
  profile:   { name, avatarColors }
  settings:  { range, ops, combatOps, timeLimit, quality, audio, breakReminder }
  model:     { facts: Map<FactId, FactState>, categories: Map<CatId, CatState> }
  inventory: { digits: number[10] }
  creatures: [{ id, level, fedCycle }]
  equipment: { owned: [{ id, level }], equipped: { weapon, armor, net, amulet } }
  progress:  { lands: { meadow: { stage, bossDefeated, gatesOpened } }, cycle }
  history:   ring buffer ostatnich 2000 prób { factId, ok, ms, helped, mode, t }
}
```

Rozmiar: ok. 410 faktów × ~60 B + 2000 prób × ~40 B ≈ 100–150 KB [MECHANIZM, pewność 5: szacunek z liczby pól].

---

## 20. Architektura kodu

### 20.1. Stos technologiczny

| Warstwa | Wybór | Uzasadnienie |
|---|---|---|
| Język | **TypeScript** (strict) | typy dla modelu ucznia i zapisu |
| Budowanie | **Vite** | szybki dev, statyczny build do `dist/` |
| 3D | **three.js** (przypięta wersja) | lekki, duża społeczność, pełna kontrola nad cieniami |
| Post-processing | `postprocessing` (pmndrs) | łączy efekty w mniej przejść (ważne na GPU kafelkowym) |
| UI | nakładka **DOM/HTML + CSS**, bez frameworka lub z Preact (~3–4 KB) | tekst, dostępność, dotyk łatwiejsze niż UI w WebGL |
| PWA | `vite-plugin-pwa` (Workbox) | manifest + service worker z precache |
| Zapis | IndexedDB przez `idb-keyval` | prosty, asynchroniczny |
| Testy | **Vitest** + `fast-check` (testy właściwości) | szybkie, zgodne z Vite |
| E2E (opcjonalnie) | Playwright (Chromium) | test dymny: start → walka |
| Jakość | ESLint + Prettier + `tsc --noEmit` | — |

**Rozważona alternatywa:** Babylon.js — ma „w pudełku” kaskadowe cienie, warstwę poświaty, obsługę pada i GUI. Zostaję przy three.js, bo: mniejszy pakiet [NIESPRAWDZONE: nie mierzyłem rozmiarów w tej sesji], proponowany przez rodzica, a potrzebne efekty (PCF, bloom, mgła) są w three.js dostępne. Zmiana decyzji ma sens, jeśli Etap 0 pokaże problemy z cieniami w three.js.

**WebGPU:** nie w MVP. WebGL2 jako ścieżka główna; WebGPU jako możliwe ulepszenie później.

### 20.2. Moduły

```
src/
  core/                 ← CZYSTA LOGIKA: bez DOM, bez three.js, 100% testowalna
    rng.ts              deterministyczny PRNG z ziarnem
    math/
      facts.ts          uniwersum faktów i kategorii
      generators.ts     generatory zadań per kategoria
      distractors.ts    błędne opcje
      hints.ts          strategie podpowiedzi (dane do wizualizacji)
      expr.ts           parser i ewaluator wyrażeń z bramy
      solver.ts         solver bramy (istnienie, minimum cyfr)
    adaptive/
      model.ts          stan faktów/kategorii, aktualizacja po próbie
      scheduler.ts      koszyki, regulator, dobór zadania
      calibration.ts    Próba Plusika
    combat/             maszyna stanów walki, obrażenia, bossowie
    economy/            cyfry, produkcja, koszty kuźni, skrzynie
    progression/        etapy krain, odblokowania
    save/               schemat, migracje, walidacja
  content/              DANE: stworki, wrogowie, sprzęt, krainy (TS/JSON)
  game/                 orkiestracja: maszyna stanów trybów gry, zdarzenia
  render/               three.js: świat wokselowy, meshing (worker), światło,
                        cienie, post, presety jakości, kamera, animacje
  input/                pad, dotyk, klawiatura → akcje abstrakcyjne
  ui/                   HUD, QTE, brama, baza, panel rodzica (DOM)
  platform/             IndexedDB, PWA, fullscreen, wake lock, audio
  main.ts
tests/                  testy core/ i content/
```

**Reguła zależności:** `core/` nie importuje nic spoza `core/`. `game/` zna `core/` i wysyła zdarzenia; `render/` i `ui/` tylko je obsługują. To pozwala testować całą logikę bez przeglądarki.

### 20.3. Maszyna stanów gry

```
Boot → Ekran startowy („naciśnij przycisk”) → [Próba Plusika przy 1. uruchomieniu]
     → Baza ⇄ Wyprawa(Łąka) ⇄ Łapanie
                 └→ Brama → Dungeon(pokój) ⇄ Walka → Łup → Baza
Panel rodzica: z Bazy i z Pauzy
```

### 20.4. PWA

- `manifest`: `display: fullscreen`, `orientation: landscape`, ikony 192/512 (maskable), kolory motywu.
- Service worker: precache całego builda (gra działa offline po pierwszym załadowaniu).
- Aktualizacje: nowa wersja **nigdy w trakcie sesji** — komunikat „Nowa wersja gotowa” w bazie.
- Wake Lock w trakcie gry (ekran nie gaśnie), Fullscreen API po geście użytkownika.

---

## 21. Testy i jakość

Testy jednostkowe `core/` (cel: ≥ 90% linii):

- **Generatory:** każde zadanie w zakresie ustawień, wynik całkowity i nieujemny, dzielenie bez reszty (dopóki reszta nie jest włączona).
- **Dystraktory (testy właściwości):** unikalność, ≠ poprawnej, ≥ 0, rozkład pozycji poprawnej odpowiedzi równomierny (test χ² na 10 tys. losowań).
- **Parser/solver bramy:** przykłady z GDD (54: 6×9, 50+4, 54×1, 27+27), minimum cyfr, brak rozwiązania → „dar bramy”.
- **Model ucznia:** aktualizacje `m`, pudełka Leitnera, regulator, bezpiecznik frustracji.
- **Symulacja:** „wirtualne dziecko” ze znanymi słabymi faktami (np. 7×8, 6×9 z p=0,4, reszta p=0,9) przez 500 zadań → słabe fakty pojawiają się ≥ 2× częściej niż średnia, skuteczność w oknie mieści się w 0,6–0,85, model zbiega do prawdziwych p (błąd < 0,15).
- **Ekonomia:** symulacja 20 cykli — brak blokady, Skarbiec nie rośnie bez końca.
- **Zapis:** migracje na złotych plikach, odporność na uszkodzony JSON przy imporcie.

CI (propozycja): GitHub Actions — lint, typecheck, testy, build przy każdym pushu.

---

## 22. Plan etapów

| Etap | Zakres | Kryterium ukończenia |
|---|---|---|
| **0. Spike techniczny** | Vite+TS+three.js, scena testowa z kostek (cienie PCF, bloom, mgła), 3 presety, pad + dotyk, PWA offline, hosting HTTPS testowy | na Tab S11 Ultra: pomiar fps w 3 presetach; pad działa w zainstalowanej PWA; gra startuje offline |
| **1. Rdzeń logiki** | `core/`: fakty, generatory, dystraktory, podpowiedzi, model, scheduler, kalibracja, solver bramy, ekonomia, walka (logika), zapis | testy zielone, symulacja z 21 spełnia kryteria; zero kodu grafiki |
| **2. MVP** | baza, Łąka, 4 stworki, łapanie, brama, dungeon 5 pokoi, 3 wrogów, boss, sprzęt Łąki, kuźnia, panel rodzica, zapis, PWA | patrz niżej |
| 3. Jaskinia | odejmowanie, Minusiak, nowe stworki, boss | jak MVP dla nowej krainy |
| 4. Wulkan | przekraczanie 10 | — |
| 5. Zamek | mnożenie, Razik | — |
| 6. Lodowa Kraina | dzielenie, Dzielnik, boss finałowy | — |
| 7. Szlif | dźwięk, animacje, Liczbopedia, propozycje zaakceptowane z sekcji 25 | — |

**Definicja ukończenia MVP:**

1. Pełna pętla (baza → Łąka → złapanie ≥ 3 stworków → baza → brama → dungeon → boss → łup → baza) grywalna **padem i dotykiem**.
2. Działa offline po instalacji jako PWA; pełny ekran, orientacja pozioma.
3. Zapis przetrwa zamknięcie aplikacji i restart tabletu; eksport/import działa.
4. Panel rodzica pokazuje postępy i słabe punkty; ustawienia zakresu i limitu czasu działają.
5. Adaptacja: w logach realnej gry słabe fakty pojawiają się częściej niż opanowane.
6. Preset „średni”: średnio ≥ 55 fps przez 10 min gry na Tab S11 Ultra (pomiar w grze).
7. Nie da się utknąć: brak cyfr → dar bramy; HP 0 → powrót do pokoju bez utraty postępu.

---

## 23. Ryzyka

| Ryzyko | Prawdopodobieństwo | Skutek | Środek zaradczy |
|---|---|---|---|
| Wydajność cieni/post-processingu niższa niż zakładam | [HIPOTEZA, pewność 2 że wystąpi] | niższa jakość | Etap 0 mierzy przed resztą; presety; dynamiczna rozdzielczość |
| Pad nie działa w PWA na tym tablecie / inny układ przycisków | [HIPOTEZA, pewność 2] | sterowanie | Etap 0; ręczny wybór układu; dotyk jako pełnoprawna alternatywa |
| Usunięcie danych przez Chrome | [HIPOTEZA, pewność 2] | utrata postępu | `persist()`, eksport do pliku |
| Łąka za łatwa dla dziecka, które zna 4 działania | [HIPOTEZA, pewność 4] | nuda | kalibracja, „wszystkie działania w walce”, przekraczanie 10 na Łące |
| Za dużo zadań = zmęczenie; za mało = mała wartość nauki | [HIPOTEZA, pewność 3] | motywacja | strojenie długości walk po pierwszych sesjach, dane w panelu |
| Gra jako całość uczy nie lepiej niż zwykłe ćwiczenia | patrz 26.1 | wartość edukacyjna | rdzeń = dobre ćwiczenia (adaptacja, podpowiedzi); gra = motywacja do ich wykonywania |

---

## 24. Otwarte pytania do rodzica

1. **Jaki pad?** (Xbox / PlayStation / 8BitDo / inny) — wpływa na ikony i testy.
2. **Łąka tylko z dodawaniem czy od razu „wszystkie działania w walce”?** Dziecko zna wszystkie cztery; sama Łąka może być za łatwa. Rekomendacja: tematyczne krainy + kalibracja; jeśli po 2–3 sesjach dziecko się nudzi, włączyć „wszystkie”.
3. **Zakres liczb na start:** do 20 czy do 100?
4. **Domyślny limit czasu:** zgoda na „Brak → Łagodny po 1. wyprawie”?
5. **Czy dziecko płynnie czyta?** — ile tekstu w dialogach i czy potrzebny lektor.
6. **Imię/pseudonim w grze** — czy w ogóle, czy tylko wybór wyglądu.
7. **Nazwy** (Plusik, Dopełniak, Bliźniak, Koniczynek, Chwastor) — do akceptacji lub wymiany (dobrze, jeśli dziecko samo coś nazwie).

---

## 25. Propozycje (moje pomysły, poza specyfikacją rodzica)

Każda propozycja: co daje, na czym się opiera, pewność.

1. **Liczbopedia / Mapa gwiazd tabliczki.** Każdy opanowany fakt zapala kostkę na widocznej dla dziecka mapie 10×10 w bazie. Cel: widoczny postęp. [HIPOTEZA, pewność 3] Za: prosty, jawny cel. Przeciw: może skupiać na „zaliczaniu” zamiast na grze — można ukryć, jeśli tak się stanie.
2. **Poranna rozgrzewka = karmienie.** 5 zadań z powtórek (z pudełek Leitnera) zamiast osobnego karmienia każdego stworka. [HIPOTEZA, pewność 3] Za: powtórki rozłożone w czasie ([S15]–[S16] dają mieszany obraz dla podstawówki, więc efekt niepewny). Koszt pomyłki: niski.
3. **„Pokaż mi swój sposób”.** Po poprawnej, ale wolnej odpowiedzi stworek pyta, jak dziecko liczyło (2–3 obrazki strategii do wyboru). Dane dla rodzica: czy dziecko liczy na palcach, czy korzysta ze strategii. [HIPOTEZA, pewność 2] Samoocena strategii przez 8-latka może być niewiarygodna.
4. **Tryb współpracy z rodzicem** (drugi pad): rodzic steruje stworkiem-pomocnikiem, który może dać podpowiedź OŚ. Etap 7+. [HIPOTEZA, pewność 3] Wspólna gra zwiększa zaangażowanie; nie sprawdzałem literatury.
5. **Lektor.** Czytanie działań i dialogów po polsku (Web Speech API, głos systemowy). [NIESPRAWDZONE] dostępność i jakość polskiego głosu na tym tablecie — do sprawdzenia w Etapie 0.
6. **Zadania „odwrotne” jako trzeci format:** `□ × 8 = 56`. Już częściowo w obronie (brakujący składnik). [MECHANIZM, pewność 4] Wiąże mnożenie z dzieleniem, co wymaga opanowanej odwrotności działań.
7. **Łagodne zakończenie sesji:** po czasie ustawionym przez rodzica stworki „idą spać” po zakończeniu bieżącej walki (nigdy w trakcie). [HIPOTEZA, pewność 3] Mniej konfliktów niż nagłe wyłączenie; brak danych.
8. **Eksport CSV** dla rodzica (wszystkie próby). Pewność użyteczności zależy od tego, czy rodzic chce analizować sam.
9. **Dziennik błędów typowych:** klasyfikacja błędów (±1, zgubione przeniesienie, sąsiad w tabliczce) z dystraktorów — rodzic widzi *rodzaj* błędu, nie tylko liczbę. [MECHANIZM, pewność 4] Możliwe, bo każdy dystraktor ma znany „typ błędu”; ograniczenie: przy wyborze z opcji trafienie w dystraktor może być zgadywaniem.

---

## 26. Podstawy dydaktyczne i źródła

### 26.1. Czy gra w ogóle pomoże? — stan dowodów

- **Za:** [FAKT][ABSTRAKT] metaanaliza 2015–2020 (szkoła, różne przedmioty): g = 0,54 dla uczenia się ogółem, g = 0,67 dla wyników poznawczych, bez oznak stronniczości publikacji ([S17]). Metaanaliza 24 badań PreK–12 w matematyce: efekt mały i tylko marginalnie istotny, duża niejednorodność ([S18]). Metaanaliza ćwiczeń faktów arytmetycznych z technologią: g = 0,43 ogółem ([S8]).
- **Przeciw / ograniczenia:** [FAKT][ABSTRAKT] w tej samej metaanalizie [S8] przewaga nad ćwiczeniem **bez technologii** była mała (g = 0,25) wobec g = 0,54 względem „zwykłych zajęć”. Metaanaliza RCT u dzieci z trudnościami: gry wideo nie dawały przewagi nad komputerowym drylem i tutoringiem ([S6]). Najnowsza metaanaliza wielopoziomowa: g = 0,37, ale przewaga nad **równoważnym ćwiczeniem** niepewna, żadna rodzina badań randomizowanych nie miała niskiego ryzyka błędu ([S19]).
- **Test odwrotny:** z tych samych danych da się obronić tezę „gra nie uczy lepiej niż ta sama ilość zwykłych ćwiczeń”. Dlatego:
  - (a) pewność, że efekt gry vs zwykłe zajęcia istnieje: **4**;
  - (b) pewność, że gra daje **praktycznie istotną** przewagę nad równoważnymi ćwiczeniami: **2**.
- **Decyzja projektowa wynikająca z tego:** wartość gry = **więcej chętnie wykonanych, dobrze dobranych ćwiczeń**. Dlatego silnik zadań (adaptacja, podpowiedzi, powtórki) musi być dobry sam w sobie, niezależnie od grafiki.

### 26.2. Źródła literaturowe (wszystkie: [ABSTRAKT], chyba że zaznaczono)

| # | Źródło | Populacja / projekt | Czego nie wiem (co zmieniłoby wniosek) |
|---|---|---|---|
| S1 | Boaler, *Research Suggests that Timed Tests Cause Math Anxiety*, Teaching Children Mathematics 2014 — [link](https://consensus.app/papers/details/0c9dba0a597c5295aaed45972d4ea351/?utm_source=claude_desktop) | komentarz, nie badanie | — (to opinia; cytuje inne badania) |
| S2 | Maki i in., *Math anxiety in elementary students: timing and task complexity*, J. School Psychology 2024 — [link](https://consensus.app/papers/details/d6a88966052c5a9ab20a55e06cd717cf/?utm_source=claude_desktop) | klasy 4–5, n=113, wewnątrzosobowy | wielkość efektów z CI; czy pomiar lęku był samoopisem jednorazowym |
| S3 | Orbach i in., *Reading and math anxiety in children… time pressure*, Frontiers 2026 — [link](https://consensus.app/papers/details/9730ac5f9ee95018b5238238d2c02b6b/?utm_source=claude_desktop) | klasy 3–4, n=311 | wielkość wzrostu lęku stanowego; czy efekt praktycznie istotny |
| S4 | Maki i in., *Effects of Task Timing and Complexity on… Strategy Use*, School Psychology Review 2024 — [link](https://consensus.app/papers/details/2585532ca475511cbbfaa168e84ba7d1/?utm_source=claude_desktop) | ta sama próba co S2 | czy analiza podgrup była zaplanowana |
| S5 | Van der Kleij i in., *Effects of Feedback in a Computer-Based Learning Environment*, Review of Educational Research 2015 — [link](https://consensus.app/papers/details/92512fdf281b569c9d8e9d9832a44516/?utm_source=claude_desktop) | metaanaliza, 40 badań, 70 efektów | udział badań z dziećmi <10 lat; CI dla efektów; efekt w podgrupie „podstawówka” |
| S6 | Benavides-Varela i in., *Digital-based interventions for children with mathematical learning difficulties*, Computers & Education 2020 — [link](https://consensus.app/papers/details/bd64f58d6e725c0382f58fd05e8e4595/?utm_source=claude_desktop) | metaanaliza 15 RCT, n=1073, dzieci z trudnościami | czy wniosek przenosi się na dziecko bez trudności (inna populacja) |
| S7 | Klinkenberg i in., *Computer adaptive practice of Maths ability… Elo*, Computers & Education 2011 — [link](https://consensus.app/papers/details/dd0a74ec088c56a8998cc013b203af21/?utm_source=claude_desktop) | 3648 dzieci, 10 mies., opis systemu | dokładna reguła punktacji czas+poprawność; brak porównania z innymi progami sukcesu |
| S8 | Burns i in., *Meta-Analysis of Technology-Based Mathematical Fact Practice*, J. Special Education Technology 2024 — [link](https://consensus.app/papers/details/be6429a1c1d552d8b79b6ef293dce324/?utm_source=claude_desktop) | 12 badań, 17 efektów | mała liczba badań; CI; jakość badań pierwotnych |
| S9 | Hilz i in., *Tracing students' practice behavior in an adaptive math learning program*, Learning and Instruction 2025 — [link](https://consensus.app/papers/details/f0e3da24a44a57c6bde1aeba1b9b66c0/?utm_source=claude_desktop) | klasa 5, n=890, 45 tyg., obserwacyjne | wielkości efektów; przyczynowość (to dane korelacyjne) |
| S10 | Li i in., *Visuospatially Rich Math Games Increase Anxiety…*, Mind, Brain, and Education 2025 — [link](https://consensus.app/papers/details/f0446173415a5b618aa1ef89c22694a4/?utm_source=claude_desktop) | klasa 2, n=40, pre-post bez kontroli | brak grupy kontrolnej — wzrost lęku może nie wynikać z gry |
| S11 | Rohrer i in., *A randomized controlled trial of interleaved mathematics practice*, J. Educational Psychology 2019 — [link](https://consensus.app/papers/details/9981c1c7ff815a94907701539d2d89cc/?utm_source=claude_desktop) | 54 klasy 7, RCT klastrowe, preregistrowane | przenośność na 8-latków i fakty arytmetyczne |
| S12 | Nemeth i in., *Fostering the acquisition of subtraction strategies with interleaved practice*, Learning and Instruction 2021 — [link](https://consensus.app/papers/details/8adf461197235281b3d297418ca414e5/?utm_source=claude_desktop) | klasa 3, n=236, RCT | wielkość efektu; porównanie łączyło przeplatanie z podpowiedziami porównawczymi |
| S13 | Ben-David i in., *Desirable Difficulties? Spaced and Interleaved Practice in an Educational Game*, 2023 — [link](https://consensus.app/papers/details/b845b681ea985a659793125413dd5a13/?utm_source=claude_desktop) | podstawówka, n=150, gra o tabliczce mnożenia | wielkość efektów; czas trwania; miara „efektywności” |
| S14 | Rowlandson i in., *Interleaving in Mathematical Category Learning*, JRME 2025 — [link](https://consensus.app/papers/details/67b04e018d31535493650f3bdd53e566/?utm_source=claude_desktop) | dwa duże eksperymenty klasowe, pojęcia geometryczne | wiek uczniów; moc statystyczna |
| S15 | Krauspe i in., *Do worked examples boost the spacing effect?*, Learning and Instruction 2025 — [link](https://consensus.app/papers/details/36e890fb427f571a8be678f21e09a6b9/?utm_source=claude_desktop) | klasa 4, n=213, analizy bayesowskie | przenośność z mnożenia pisemnego na fakty |
| S16 | Ebersbach, *Distributing mathematical practice of third and seventh graders*, Applied Cognitive Psychology 2018 — [link](https://consensus.app/papers/details/bb01f72909ce58d482877ad66153b813/?utm_source=claude_desktop) | klasy 3 i 7, n=213 | w klasie 3 efekt tylko po 1 tygodniu — wielkość efektu |
| S17 | Barz i in., *The Effect of Digital Game-Based Learning Interventions…*, Review of Educational Research 2023 — [link](https://consensus.app/papers/details/66a8bd7d9c22571fa8056f422a35d2ee/?utm_source=claude_desktop) | metaanaliza szkolna 2015–2020 | udział matematyki i wieku 7–9 lat; co było grupą kontrolną |
| S18 | Tokac i in., *Effects of game-based learning on students' mathematics achievement*, J. Computer Assisted Learning 2019 — [link](https://consensus.app/papers/details/55d1218bbc645614adcc846a5fd7c910/?utm_source=claude_desktop) | metaanaliza 24 badań PreK–12 | wartość efektu (abstrakt jej nie podaje) i CI |
| S19 | Zhang i in., *Does Game-Based Learning Improve K–12 Mathematics Achievement Beyond Equivalent Practice?*, IJRISS 2026 — [link](https://consensus.app/papers/details/cb55f817f1d65202bc8cf8609f3b34b1/?utm_source=claude_desktop) | 19 rodzin badań w modelu głównym | renoma czasopisma nieznana mi; autorzy sami oceniają ryzyko błędu badań pierwotnych jako wysokie |

### 26.3. Źródła techniczne

| # | Źródło | Głębokość |
|---|---|---|
| T1 | GSMArena — *Samsung Galaxy Tab S11 Ultra, full specifications* — [link](https://www.gsmarena.com/samsung_galaxy_tab_s11_ultra_5g-14057.php) | [WTÓRNE] (przez wyszukiwarkę; nie porównywałem ze stroną Samsunga) |
| T2 | three.js, zgłoszenie #32591 (regresja cieni PCF w r182) — [link](https://github.com/mrdoob/three.js/issues/32591) | [WTÓRNE] (streszczenie z wyszukiwarki) |
| T3 | W3C Gamepad, PR #120 „Require secure context” — [link](https://github.com/w3c/gamepad/pull/120) | [WTÓRNE] |
| T4 | *The JavaScript Gamepad API: A Practical Guide* (dev.to) — [link](https://dev.to/trkb/the-javascript-gamepad-api-a-practical-guide-to-reading-controller-input-2lmc) | [WTÓRNE] |
| T5 | react-three-fiber, zgłoszenie #3749 „PCFSoftShadowMap is deprecated” — [link](https://github.com/pmndrs/react-three-fiber/issues/3749) | [WTÓRNE] |

### 26.4. Niesprawdzone w tym dokumencie

- Service worker wymaga HTTPS (wiedza ogólna).
- Skuteczność `navigator.storage.persist()` na Chrome/Android.
- Rozmiary pakietów three.js vs Babylon.js.
- Dostępność polskiego głosu Web Speech API na tablecie.
- Normy czasu odpowiedzi dla 8-latków (celowo niepotrzebne — progi są względne).
- Czy pad dziecka jest rozpoznawany ze standardowym mapowaniem w Chrome/Android.

Punkty techniczne z tej listy rozstrzyga Etap 0 pomiarem na urządzeniu.
