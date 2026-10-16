# runner

## ADDED Requirements

### Requirement: SIGTERM der systemd-Rückfallgrenze
Trifft SIGTERM ein, wenn die Laufzeit die systemd-Grenze `TimeoutStartSec` aus `limits.conf` (Limit + 60 s) erreicht hat, SHALL der Runner den Lauf mit status `timeout` beenden und eine Benachrichtigung senden; die Einordnung aus #9 (ab Limit − Toleranz `timeout`, davor `stopped`) bleibt unverändert.

#### Scenario: systemd bricht den hängenden Lauf ab
- **WHEN** SIGTERM bei einer Laufzeit gleich dem `TimeoutStartSec`-Wert aus `limitsConf()` eintrifft
- **THEN** endet der Lauf mit status timeout und es wird eine Benachrichtigung gesendet

#### Scenario: Manueller Stop bleibt stopped
- **WHEN** SIGTERM vor Limit − Toleranz eintrifft (nur `systemctl stop`, da die systemd-Grenze über dem Limit liegt)
- **THEN** endet der Lauf mit status stopped

#### Scenario: Internes Zeitlimit greift zuerst
- **WHEN** der Runner nicht hängt und das Zeitlimit erreicht
- **THEN** bricht er selbst mit status timeout ab, bevor systemd SIGTERM schickt

#### Scenario: Runner reagiert nicht auf SIGTERM
- **WHEN** der Runner nach SIGTERM nicht endet
- **THEN** beendet systemd ihn nach `TimeoutStopSec` mit SIGKILL, und der Log-Leser wertet die verwaiste running-Zeile als timeout
