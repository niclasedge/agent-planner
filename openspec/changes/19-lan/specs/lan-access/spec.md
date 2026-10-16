# lan-access

## ADDED Requirements

### Requirement: Bind-Adresse einstellbar
Der Web-Server SHALL an die Adresse aus `AGENT_PLANNER_HOST` binden, Vorgabe `127.0.0.1`, und in der Log-Zeile die erreichbaren URLs nennen.

#### Scenario: Vorgabe
- **WHEN** der Server ohne `AGENT_PLANNER_HOST` startet
- **THEN** bindet er an 127.0.0.1 und loggt `http://127.0.0.1:<port>/`

#### Scenario: Alle Schnittstellen
- **WHEN** `AGENT_PLANNER_HOST=0.0.0.0` und `AGENT_PLANNER_ALLOWED_HOSTS=192.0.2.65:4317` gesetzt sind
- **THEN** nennt die Log-Zeile `http://127.0.0.1:4317/` und `http://192.0.2.65:4317/`

### Requirement: Erlaubte Hosts aus der Umgebung
Der Guard SHALL neben Loopback die Hosts aus `AGENT_PLANNER_ALLOWED_HOSTS` (Komma-Liste `host:port`) zulassen, exakt verglichen, der Hostname ohne Rücksicht auf Groß-/Kleinschreibung; alle anderen Hosts SHALL er mit 403 abweisen. Die Prüfung von Origin, Sec-Fetch-Site und HX-Request SHALL unverändert gelten.

#### Scenario: LAN-Host same-origin
- **WHEN** ein POST mit `Host: 192.0.2.65:4317`, `Origin: http://192.0.2.65:4317` und `HX-Request: true` kommt und der Host in der Liste steht
- **THEN** geht die Anfrage durch

#### Scenario: Fremder Host
- **WHEN** eine Anfrage mit `Host: evil.example:4317` kommt
- **THEN** antwortet der Guard mit 403

#### Scenario: Origin eines anderen LAN-Hosts
- **WHEN** ein POST mit erlaubtem `Host: 192.0.2.65:4317` und `Origin: http://192.0.2.20:4317` kommt
- **THEN** antwortet der Guard mit 403

#### Scenario: DNS-Rebinding
- **WHEN** eine Anfrage mit `Host: 192.0.2.65.rebind.evil:4317` oder einem erlaubten Namen mit anderem Port kommt
- **THEN** antwortet der Guard mit 403

#### Scenario: Loopback ohne Liste
- **WHEN** `AGENT_PLANNER_ALLOWED_HOSTS` fehlt
- **THEN** gehen `127.0.0.1:<port>` und `localhost:<port>` weiter durch, LAN-Hosts nicht

### Requirement: Quell-IP-Prüfung
Der Guard SHALL für alle Methoden die Quell-IP prüfen und nur Loopback (`127.0.0.0/8`, `::1`) sowie die Netze aus `AGENT_PLANNER_ALLOWED_CLIENTS` zulassen; IPv4-mapped IPv6 SHALL als IPv4 gelten. Sonst SHALL er mit 403 „Abgelehnt: Quelle“ antworten.

#### Scenario: LAN-Client
- **WHEN** eine Anfrage von `192.0.2.20` kommt und `AGENT_PLANNER_ALLOWED_CLIENTS=192.0.2.0/24` gesetzt ist
- **THEN** geht sie durch

#### Scenario: Tailnet-Client mit gefälschtem Host
- **WHEN** ein GET oder POST von `100.64.0.7` mit `Host: 127.0.0.1:4317` kommt
- **THEN** antwortet der Guard mit 403 „Abgelehnt: Quelle“

#### Scenario: Andere private IP
- **WHEN** eine Anfrage von `10.0.0.5` kommt
- **THEN** antwortet der Guard mit 403

#### Scenario: Loopback ohne Liste
- **WHEN** `AGENT_PLANNER_ALLOWED_CLIENTS` fehlt und eine Anfrage von `127.0.0.1` oder `::1` kommt
- **THEN** geht sie durch, eine LAN-IP nicht

#### Scenario: Quell-IP fehlt
- **WHEN** eine Anfrage ohne ermittelte Quell-IP (`c.env.ip` fehlt) den Guard erreicht
- **THEN** antwortet er mit 403 „Abgelehnt: Quelle“

#### Scenario: Zu weites Netz
- **WHEN** `AGENT_PLANNER_ALLOWED_CLIENTS` `0.0.0.0/0` oder ein Präfix kürzer als `/8` enthält
- **THEN** scheitert der Start mit einer Meldung, die den Eintrag und „mindestens /8“ nennt

### Requirement: Exit bei gestopptem Lauf
`agent-planner run` SHALL bei Status `stopped` mit Exit 0 enden und bei `error`, `timeout`, `auth_missing` mit Exit ≠ 0.

#### Scenario: systemctl stop
- **WHEN** der Lauf per SIGTERM vor dem Zeitlimit beendet wird
- **THEN** gibt `run` `stopped` aus und endet mit Exit 0

### Requirement: Warnungen in der CLI
`validate-cron` und `sync` SHALL für nie feuernde Zeitpläne eine Zeile `Warnung: …` auf stderr ausgeben und mit Exit 0 enden.

#### Scenario: validate-cron
- **WHEN** `agent-planner validate-cron '0 9 31 2 *'` läuft
- **THEN** ist der Exit 0 und stderr enthält „Warnung“ und „feuert nie“

#### Scenario: sync
- **WHEN** `sync` einen Agenten mit Cron `0 9 31 2 *` abgleicht
- **THEN** ist der Exit 0 und stderr nennt den Slug und „feuert nie“
