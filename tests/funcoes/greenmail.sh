#!/usr/bin/env bash
# Servidor de correio local para os testes (GreenMail): IMAP 3143, SMTP 3025, API 8080, sem cifra.
# Contas: ana / segredo (ana@exemplo.pt) e rita / segredo (rita@padaria.pt). Para parar: kill do processo java.
# Com Docker:  docker run --rm -p 3025:3025 -p 3143:3143 -p 8080:8080 -e GREENMAIL_OPTS="-Dgreenmail.setup.test.smtp -Dgreenmail.setup.test.imap -Dgreenmail.hostname=0.0.0.0 -Dgreenmail.users=ana:segredo@exemplo.pt,rita:segredo@padaria.pt" greenmail/standalone:2.1.3
# Sem Docker (Java 17+): descarrega o .jar da Maven Central e corre-o.
set -euo pipefail
DIR="${TMPDIR:-/tmp}/greenmail"; mkdir -p "$DIR"
JAR="$DIR/greenmail-standalone-2.1.3.jar"
[ -f "$JAR" ] || curl -sSfL -o "$JAR" https://repo1.maven.org/maven2/com/icegreen/greenmail-standalone/2.1.3/greenmail-standalone-2.1.3.jar
java -Dgreenmail.setup.test.smtp -Dgreenmail.setup.test.imap -Dgreenmail.hostname=127.0.0.1 \
  -Dgreenmail.users=ana:segredo@exemplo.pt,rita:segredo@padaria.pt -jar "$JAR" > "$DIR/log" 2>&1 &
for _ in $(seq 1 30); do (echo > /dev/tcp/127.0.0.1/3143) 2>/dev/null && { echo "GreenMail a correr (pid $!)"; exit 0; }; sleep 1; done
echo "O GreenMail não arrancou; ver $DIR/log"; exit 1
