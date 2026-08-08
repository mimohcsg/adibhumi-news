# आदिभूमि (Adibhumi) — West MP tribal news

Hindi digital news portal for **Western Madhya Pradesh tribal communities** — **Malwa–Nimar** belt (Jhabua, Alirajpur, Dhar, Barwani, Khargone, and related districts), plus Indore/Ujjain division coverage and statewide MP.

Sister project to Satyavrat (`drishtilok-news`); same live RSS architecture, distinct brand and focus.

## Run locally

```bash
cd adibhumi-news
npm install
npm start
```

Open [http://localhost:4174](http://localhost:4174).

## Deploy (Render)

**Live URL:** https://adibhumi-news.onrender.com

One-click deploy (Node server required — GitHub Pages cannot run the live RSS API):

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/mimohcsg/adibhumi-news)

Or in the [Render dashboard](https://dashboard.render.com/) → **New** → **Blueprint** → select this repo (`render.yaml`).

**Repo:** https://github.com/mimohcsg/adibhumi-news


## Coverage focus

| Theme | Areas |
|------|--------|
| **आदिवासी ज़िले** | झाबुआ, अलीराजपुर, धार, बड़वानी, खरगोन, खंडवा, रतलाम… |
| **मालवा · निमाड़** | Western MP cultural/geographic belt |
| **मध्य प्रदेश** | Statewide politics & general news |
| **भारत** | National stories on the front page |

## API

Same shape as Satyavrat:

- `GET /api/news?lang=hi`
- `GET /api/news?lang=hi&division=indore-div`
- `GET /api/news?lang=hi&district=jhabua`
- `GET /api/region`
- `GET /api/health`
- `GET /api/epaper?lang=hi`

## E-paper

- Page: `/epaper.html`
- Locks daily at **11:59 PM IST**
