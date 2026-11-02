# Internationalization contract for the React client

The API speaks English (`en`), French (`fr`) and Arabic (`ar`). The client
owns its own UI text (buttons, forms, pages); the API owns the text of the
marketplace domain (errors, success messages and the labels of lookup values)
and serves it as i18next catalogs, so both sides translate the same codes the
same way.

## Sending the language

Send the user's language on every request, either as a header or a query
parameter (the query parameter wins):

```http
Accept-Language: ar
GET /api/listings?lang=ar
```

Without either, the API answers in French. Unsupported values fall back
instead of failing. Every response carries `Content-Language`.

Registration saves the request language as the user's `locale`, which the API
uses for everything it sends later on its own: verification and password
reset emails, and inspection report PDFs (in the buyer's language). Login and
refresh-token responses return it as `user.locale`.

## Loading the catalogs

```http
GET /api/i18n/{locale}/{namespace}
```

| Namespace  | Contents                                                     |
| ---------- | ------------------------------------------------------------ |
| `errors`   | Error messages, keyed by the `code` of each error            |
| `messages` | Success messages, keyed by the `code` of success responses   |
| `enums`    | Labels of lookup values and statuses, keyed by kind and slug |

The catalogs use the i18next JSON v4 format: `{{name}}` interpolation and
`_zero`/`_one`/`_two`/`_few`/`_many`/`_other` plural suffixes chosen with
`Intl.PluralRules` (Arabic uses all six, French uses `_one`, `_many` and
`_other`). Responses are cacheable for an hour and carry an `ETag`, so
revalidation is cheap.

```ts
import i18next from "i18next";
import HttpBackend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

i18next
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    lng: "fr",
    fallbackLng: "en",
    supportedLngs: ["en", "fr", "ar"],
    // Local namespaces (common, forms, ...) come from the client bundle; the
    // API serves errors, messages and enums.
    ns: ["common", "errors", "messages", "enums"],
    defaultNS: "common",
    backend: {
      loadPath: (_languages: string[], namespaces: string[]) =>
        ["errors", "messages", "enums"].includes(namespaces[0])
          ? `${API_URL}/api/i18n/{{lng}}/{{ns}}`
          : "/locales/{{lng}}/{{ns}}.json",
    },
    interpolation: { escapeValue: false },
  });
```

When the user switches language, call `i18next.changeLanguage(locale)`, set
`<html lang dir>` (`dir="rtl"` for Arabic) and send the new language with the
following requests.

## Errors

Every error response has this shape:

```json
{
  "errors": [
    {
      "code": "validation.string_min",
      "message": "يجب أن يحتوي على 3 أحرف على الأقل",
      "field": "firstName",
      "params": { "count": 3 }
    }
  ]
}
```

- `code` is stable: branch on it, never on `message`.
- `message` is already translated into the response language; show it as is,
  or translate `code` with `params` to follow a language switch without
  refetching: `t(`errors:${code}`, params)`.
- `field` is the dotted path of the invalid input (`files`, `car.price`);
  show the message next to that input. Errors without `field` concern the
  whole request.
- `params` is present only when the message uses values (`count`, `id`,
  `minimum`, `options`, ...).

Generic validation codes live under `validation.*` (`validation.required`,
`validation.invalid_type.number`, `validation.invalid_option`, ...); domain
rules have their own codes (`media.min_images`, `listing.not_found`, ...).

## Success messages

Responses that confirm an action carry a code and a message in the same way:

```json
{
  "code": "auth.password_reset_email_sent",
  "message": "…",
  "params": { "count": 5 }
}
```

Translate with `t(`messages:${code}`, params)` or show `message`.

## Email verification

The link in the verification email opens the API, which redirects the browser
to a page the client must provide:

```text
{CLIENT_URL}/verify-email?status=success&code=auth.account_verified&lang=fr
{CLIENT_URL}/verify-email?status=error&code=auth.link_expired&lang=fr
```

Use `lang` for the page language: the user may be on a new device. Translate
`code` with `messages:` when `status` is `success` and `errors:` when it is
`error`. Links work once, so for `auth.link_expired` and `auth.token_invalid`
offer to resend the email (`POST /api/auth/re-verify`).

## Lookup values and statuses

The API returns lookup values and statuses as slugs, never as labels. Translate
them with the `enums` namespace:

| Value in responses                                   | Key                                                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `car.carburant.carburant` (`diesel`)                 | `enums:carburant.diesel`                                                                 |
| `car.state.state` (`very_good`)                      | `enums:car_state.very_good`                                                              |
| `car.origin.origin` (`ww`)                           | `enums:car_origin.ww`                                                                    |
| `car.transmission` (`manual`)                        | `enums:transmission.manual`                                                              |
| `car.city.slug` (`casablanca`)                       | `enums:city.casablanca`                                                                  |
| `equipment[].slug` and `category.slug`               | `enums:equipment.*`, `enums:equipment_category.*`                                        |
| `listing.status` (`pending`)                         | `enums:listing_status.pending`                                                           |
| `sort` options of `GET /api/listings`                | `enums:listing_sort.price_asc`                                                           |
| `inspection.status`, `verdict`, `mileageConsistency` | `enums:inspection_status.*`, `enums:inspection_verdict.*`, `enums:mileage_consistency.*` |
| inspection `sections[].category` and item `status`   | `enums:inspection_category.*`, `enums:inspection_item_status.*`                          |
| `user.role`                                          | `enums:role.buyer`                                                                       |

Use the slug itself (or the English `name` where the response has one) as the
fallback when a key is missing. Car makes and models are brand names and are
not translated.

Text that people typed (listing titles and descriptions, inspection notes,
reviews) is shown as written, in whatever language it was typed.
