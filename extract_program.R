# Extract conference program from xlsx to JSON for the web app
library(readxl)
library(dplyr)
library(stringr)
library(jsonlite)

path <- "Programa_XVII_CNM_filtros(1).xlsx"

raw <- read_excel(path, sheet = "PROGRAMA", skip = 5)
names(raw) <- c("dia", "hora", "tematica", "titulo", "autores", "lugar")

# Day/location header rows carry info in the hora column; propagate them down
day_map <- c(
  "LUNES 19 DE OCTUBRE"      = "Lunes 19",
  "MARTES 20 DE OCTUBRE"     = "Martes 20",
  "MIÉRCOLES 21 DE OCTUBRE"  = "Miércoles 21",
  "JUEVES 22 DE OCTUBRE"     = "Jueves 22",
  "VIERNES 23 DE OCTUBRE"    = "Viernes 23"
)
venues <- c("Pasillo principal", "Auditorio \u201cDr. Reyes S. Tamez Guerra\u201d",
            "Auditorio Central", "Auditorio de Posgrado", "Patio de aulas",
            "AULA BS101 Castor", "AULA BS303 Odocoileus")

cur_day <- NA_character_; cur_venue <- NA_character_
days <- character(nrow(raw)); venues_col <- character(nrow(raw))
for (i in seq_len(nrow(raw))) {
  h <- raw$hora[i]
  if (is.na(raw$dia[i]) && !is.na(h) && h %in% names(day_map)) cur_day <- day_map[[h]]
  if (is.na(raw$dia[i]) && !is.na(h) && h %in% venues) cur_venue <- h
  days[i] <- cur_day; venues_col[i] <- cur_venue
}

# Meals/closing dinner have no venue in the source; don't inherit a misleading one
no_inherit <- c("Comida", "Cena clausura")

events <- raw |>
  filter(!is.na(dia)) |>
  mutate(
    day = days[!is.na(raw$dia)],
    venue = if_else(tematica %in% no_inherit, lugar,
                    coalesce(lugar, venues_col[!is.na(raw$dia)])),
    venue = coalesce(venue, ""),
    hora_num = suppressWarnings(as.numeric(hora)),
    time = case_when(
      !is.na(hora_num) ~ format(as.POSIXct(hora_num * 86400, origin = "1970-01-01", tz = "UTC"), "%H:%M"),
      TRUE ~ str_sub(hora, 1, 5)
    ),
    type = case_when(
      str_detect(tematica, regex("^Simposio", ignore_case = TRUE)) ~ "Simposio",
      str_detect(tematica, regex("carteles", ignore_case = TRUE)) ~ "Cartel",
      str_detect(tematica, regex("Conferencia magistral", ignore_case = TRUE)) ~ "Conferencia magistral",
      tematica %in% c("Registro", "Receso", "Comida", "Clausura", "Inauguración",
                      "Evento cultural", "Cena clausura", "Fotografia de grupo",
                      "Asamblea General Ordinaria", "Entrega de reconocimientos") ~ "Logística",
      TRUE ~ "Ponencia"
    ),
    session = str_trim(str_remove(tematica, regex("^Simposio:\\s*", ignore_case = TRUE))),
    title = str_trim(coalesce(titulo, tematica)),
    authors = str_trim(coalesce(autores, ""))
  ) |>
  select(day, time, venue, type, session, title, authors)

# sort by day order then time
day_order <- unname(day_map)
events <- events |>
  mutate(day = factor(day, levels = day_order)) |>
  arrange(day, time) |>
  mutate(day = as.character(day))

write_json(events, "program.json", pretty = TRUE, auto_unbox = TRUE)

# Also as a JS file so index.html works when opened directly (file:// blocks fetch)
js <- toJSON(events, pretty = TRUE, auto_unbox = TRUE)
writeLines(paste0("const PROGRAM_DATA = ", js, ";"), "program.js")

cat("Wrote", nrow(events), "events to program.json and program.js\n")
