# ============================================================
# Grand Chase - Screen Drop Tracker
# ============================================================
# Monitora a tela procurando a janela "Registro de Item",
# extrai cada slot de item, identifica por hash de imagem,
# e salva tudo em JSON para calcular porcentagem de drop.
# ============================================================

import os
import sys
import json
import time
import hashlib
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import mss
import imagehash
from PIL import Image

# ── Paths ────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
ITEMS_DB_PATH = BASE_DIR / "items_db.json"
DROPS_LOG_PATH = BASE_DIR / "drops_log.json"
REFERENCE_DIR = BASE_DIR / "reference_items"
REFERENCE_DIR.mkdir(exist_ok=True)

# ── Config ───────────────────────────────────────────────────
SCAN_INTERVAL = 1.5          # segundos entre cada scan
HASH_TOLERANCE = 12          # distância máx de hamming para considerar match
DIALOG_COOLDOWN = 5          # segundos mínimos entre dois registros da mesma tela
MIN_ITEM_PIXELS = 300        # pixels mínimos de conteúdo para considerar slot não-vazio

# Cores para detecção (HSV ranges)
DIALOG_TITLE_TEXT = "Registro de Item"

# Grid config – baseado no screenshot do Templo do Tempo
# O grid tem 5 colunas e até 6 linhas
GRID_COLS = 5
GRID_ROWS = 6


# ── Database helpers ──────────────────────────────────────────
def load_json(path: Path, default=None):
    if default is None:
        default = []
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default


def save_json(path: Path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def compute_phash(img: Image.Image) -> str:
    """Computa perceptual hash de uma imagem PIL."""
    return str(imagehash.phash(img, hash_size=16))


def compute_dhash(img: Image.Image) -> str:
    """Computa difference hash como fallback."""
    return str(imagehash.dhash(img, hash_size=16))


def hash_distance(h1: str, h2: str) -> int:
    """Calcula distância de Hamming entre dois hashes hex."""
    ih1 = imagehash.hex_to_hash(h1)
    ih2 = imagehash.hex_to_hash(h2)
    return ih1 - ih2


# ── Screen capture ────────────────────────────────────────────
def capture_screen() -> np.ndarray:
    """Captura a tela inteira e retorna como numpy array BGR."""
    with mss.mss() as sct:
        monitor = sct.monitors[1]  # monitor principal
        screenshot = sct.grab(monitor)
        img = np.array(screenshot)
        # mss retorna BGRA, converter para BGR
        return cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)


# ── Dialog detection ──────────────────────────────────────────
def find_dialog_region(screen: np.ndarray):
    """
    Procura a região do diálogo "Registro de Item" na tela.
    Usa template matching com o título do diálogo.
    Retorna (x, y, w, h) do diálogo ou None.
    """
    gray = cv2.cvtColor(screen, cv2.COLOR_BGR2GRAY)
    h_screen, w_screen = gray.shape

    # Estratégia: procurar pela barra do título do diálogo
    # O diálogo tem um padrão visual distinto:
    # - Fundo escuro semi-transparente
    # - Título "Registro de Item" centralizado no topo
    # - Grid de itens abaixo
    # - Botão "CONFIRMAR" abaixo do grid

    # Vamos procurar pelo texto "CONFIRMAR" que é bem distinto
    # e pelo padrão do grid

    # Abordagem: procurar a região com a cor característica do header
    # O header do diálogo tem uma cor escura/azulada específica

    # Converter para HSV para melhor detecção de cor
    hsv = cv2.cvtColor(screen, cv2.COLOR_BGR2HSV)

    # Procurar pela cor do background do grid (azul claro/lilás)
    # No screenshot, os slots vazios têm tom azul claro
    lower_grid = np.array([100, 30, 120])
    upper_grid = np.array([140, 120, 220])
    mask_grid = cv2.inRange(hsv, lower_grid, upper_grid)

    # Dilatar para juntar áreas próximas
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (20, 20))
    mask_grid = cv2.dilate(mask_grid, kernel, iterations=3)

    # Encontrar contornos
    contours, _ = cv2.findContours(mask_grid, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return None

    # Filtrar contornos por tamanho - o grid é grande
    min_area = (w_screen * 0.2) * (h_screen * 0.2)  # pelo menos 20% da tela
    valid_contours = []
    for c in contours:
        area = cv2.contourArea(c)
        if area > min_area:
            valid_contours.append(c)

    if not valid_contours:
        return None

    # Pegar o maior contorno que parece ser o grid
    largest = max(valid_contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(largest)

    # Expandir um pouco para pegar o diálogo todo
    margin_x = int(w * 0.05)
    margin_y_top = int(h * 0.1)   # título acima
    margin_y_bot = int(h * 0.15)  # botão confirmar abaixo

    x = max(0, x - margin_x)
    y = max(0, y - margin_y_top)
    w = min(w_screen - x, w + 2 * margin_x)
    h = min(h_screen - y, h + margin_y_top + margin_y_bot)

    return (x, y, w, h)


def find_dialog_by_template(screen: np.ndarray, template_path: str):
    """
    Alternativa: usa template matching com uma imagem salva do título.
    Mais preciso mas requer uma imagem de referência.
    """
    if not os.path.exists(template_path):
        return None

    template = cv2.imread(template_path, cv2.IMREAD_GRAYSCALE)
    gray = cv2.cvtColor(screen, cv2.COLOR_BGR2GRAY)

    result = cv2.matchTemplate(gray, template, cv2.TM_CCOEFF_NORMED)
    _, max_val, _, max_loc = cv2.minMaxLoc(result)

    if max_val > 0.7:
        return max_loc  # (x, y) do canto superior esquerdo do match
    return None


# ── Grid extraction ───────────────────────────────────────────
def extract_grid_region(screen: np.ndarray, dialog_region: tuple) -> np.ndarray:
    """Extrai apenas a região do grid de items do diálogo."""
    dx, dy, dw, dh = dialog_region

    # O grid começa após o título e termina antes do botão CONFIRMAR
    # Baseado no screenshot: título ~10% do topo, botão ~12% do fundo
    grid_y_start = dy + int(dh * 0.08)
    grid_y_end = dy + int(dh * 0.82)
    grid_x_start = dx + int(dw * 0.02)
    grid_x_end = dx + int(dw * 0.98)

    return screen[grid_y_start:grid_y_end, grid_x_start:grid_x_end]


def extract_item_slots(grid_img: np.ndarray) -> list[np.ndarray]:
    """
    Divide a imagem do grid em slots individuais.
    Retorna lista de imagens de cada slot.
    """
    h, w = grid_img.shape[:2]
    cell_w = w // GRID_COLS
    cell_h = h // GRID_ROWS

    slots = []
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            x1 = col * cell_w + 2   # pequena margem para evitar bordas
            y1 = row * cell_h + 2
            x2 = (col + 1) * cell_w - 2
            y2 = (row + 1) * cell_h - 2

            cell = grid_img[y1:y2, x1:x2]
            slots.append(cell)

    return slots


def is_slot_empty(slot_img: np.ndarray) -> bool:
    """Verifica se um slot está vazio (sem item)."""
    if slot_img.size == 0:
        return True

    # Converter para HSV
    hsv = cv2.cvtColor(slot_img, cv2.COLOR_BGR2HSV)

    # Verificar saturação - slots com itens têm mais cor/saturação
    saturation = hsv[:, :, 1]
    value = hsv[:, :, 2]

    # Slots vazios são uniformemente azul claro com baixa variação
    sat_std = np.std(saturation)
    val_std = np.std(value)

    # Se a variação de cor é muito baixa, provavelmente é vazio
    if sat_std < 15 and val_std < 20:
        return True

    # Verificar se tem pixels com saturação significativa
    high_sat_pixels = np.sum(saturation > 60)
    total_pixels = saturation.size

    if high_sat_pixels / total_pixels < 0.05:
        return True

    return False


def extract_item_icon(slot_img: np.ndarray) -> np.ndarray:
    """
    Extrai apenas o ícone do item do slot, removendo bordas e overlays.
    Pega a parte central do slot que contém o ícone.
    """
    h, w = slot_img.shape[:2]
    # O ícone ocupa a parte central, ignorando bordas e labels
    margin = int(min(h, w) * 0.12)
    return slot_img[margin:h - margin, margin:w - margin]


# ── Item identification ───────────────────────────────────────
class ItemDatabase:
    def __init__(self, db_path: Path = ITEMS_DB_PATH):
        self.db_path = db_path
        self.items = load_json(db_path, default={})
        if isinstance(self.items, list):
            self.items = {}
        self._next_id = self._get_next_id()

    def _get_next_id(self) -> int:
        if not self.items:
            return 1
        max_id = 0
        for key in self.items:
            try:
                num = int(key.replace("item_", ""))
                max_id = max(max_id, num)
            except ValueError:
                pass
        return max_id + 1

    def find_item(self, phash: str, dhash: str) -> str | None:
        """Procura um item pelos hashes. Retorna item_id ou None."""
        best_match = None
        best_distance = float("inf")

        for item_id, item_data in self.items.items():
            # Comparar phash
            if "phash" in item_data:
                dist = hash_distance(phash, item_data["phash"])
                if dist < best_distance:
                    best_distance = dist
                    best_match = item_id

            # Comparar dhash como segundo critério
            if "dhash" in item_data and best_distance > HASH_TOLERANCE // 2:
                dist_d = hash_distance(dhash, item_data["dhash"])
                if dist_d < best_distance:
                    best_distance = dist_d
                    best_match = item_id

        if best_distance <= HASH_TOLERANCE:
            return best_match
        return None

    def add_item(self, phash: str, dhash: str, slot_img: np.ndarray) -> str:
        """Adiciona um novo item ao database. Retorna o item_id."""
        item_id = f"item_{self._next_id}"
        self._next_id += 1

        # Salvar imagem de referência
        ref_path = REFERENCE_DIR / f"{item_id}.png"
        cv2.imwrite(str(ref_path), slot_img)

        self.items[item_id] = {
            "phash": phash,
            "dhash": dhash,
            "name": f"[Item Desconhecido #{self._next_id - 1}]",
            "reference_image": str(ref_path.name),
            "first_seen": datetime.now().isoformat(),
        }

        self.save()
        print(f"  [NOVO ITEM] {item_id} salvo em {ref_path.name}")
        print(f"    -> Renomeie no items_db.json para identificar!")
        return item_id

    def save(self):
        save_json(self.db_path, self.items)

    def get_name(self, item_id: str) -> str:
        if item_id in self.items:
            return self.items[item_id].get("name", item_id)
        return item_id


# ── Drop Logger ───────────────────────────────────────────────
class DropLogger:
    def __init__(self, log_path: Path = DROPS_LOG_PATH):
        self.log_path = log_path
        self.logs = load_json(log_path, default=[])

    def log_run(self, map_name: str, items_found: list[dict]):
        """Registra uma run com os items encontrados."""
        entry = {
            "id": f"run_{int(time.time() * 1000)}",
            "map": map_name,
            "items": items_found,
            "timestamp": datetime.now().isoformat(),
        }
        self.logs.append(entry)
        self.save()
        return entry

    def save(self):
        save_json(self.log_path, self.logs)

    def get_stats(self, map_name: str = None) -> dict:
        """Calcula estatísticas de drop."""
        filtered = self.logs
        if map_name:
            filtered = [l for l in self.logs if l["map"] == map_name]

        total_runs = len(filtered)
        if total_runs == 0:
            return {"total_runs": 0, "items": {}}

        item_counts = {}
        for run in filtered:
            for item in run["items"]:
                item_id = item["item_id"]
                if item_id not in item_counts:
                    item_counts[item_id] = 0
                item_counts[item_id] += item.get("qty", 1)

        stats = {
            "total_runs": total_runs,
            "items": {},
        }
        for item_id, count in item_counts.items():
            stats["items"][item_id] = {
                "count": count,
                "drop_rate": round(count / total_runs * 100, 2),
            }

        return stats


# ── Map detection ─────────────────────────────────────────────
def detect_current_map(screen: np.ndarray) -> str:
    """
    Tenta detectar o mapa atual pela tela.
    Por enquanto retorna o mapa configurado manualmente.
    """
    # TODO: Implementar OCR para ler o nome do mapa da tela
    # O nome do mapa aparece no canto superior direito
    return CURRENT_MAP


# ── Main tracker ──────────────────────────────────────────────
CURRENT_MAP = "templo_do_tempo"  # Configurar manualmente ou implementar OCR


def process_dialog(screen: np.ndarray, dialog_region: tuple,
                   item_db: ItemDatabase, drop_logger: DropLogger):
    """Processa um diálogo de Registro de Item detectado."""
    print(f"\n{'='*60}")
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Registro de Item DETECTADO!")
    print(f"{'='*60}")

    # Extrair grid
    grid = extract_grid_region(screen, dialog_region)

    if grid.size == 0:
        print("  [ERRO] Grid vazio, ignorando...")
        return

    # Debug: salvar screenshot do grid
    debug_path = BASE_DIR / "debug"
    debug_path.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    cv2.imwrite(str(debug_path / f"grid_{timestamp}.png"), grid)
    cv2.imwrite(str(debug_path / f"screen_{timestamp}.png"), screen)

    # Extrair slots
    slots = extract_item_slots(grid)
    items_found = []

    print(f"  Analisando {len(slots)} slots...")

    for i, slot in enumerate(slots):
        if slot.size == 0:
            continue

        if is_slot_empty(slot):
            continue

        row = i // GRID_COLS
        col = i % GRID_COLS
        print(f"  Slot [{row},{col}] - Item encontrado!")

        # Salvar slot para debug
        cv2.imwrite(str(debug_path / f"slot_{timestamp}_{row}_{col}.png"), slot)

        # Extrair ícone e computar hash
        icon = extract_item_icon(slot)
        pil_img = Image.fromarray(cv2.cvtColor(icon, cv2.COLOR_BGR2RGB))

        phash = compute_phash(pil_img)
        dhash = compute_dhash(pil_img)

        # Procurar no database
        item_id = item_db.find_item(phash, dhash)

        if item_id:
            name = item_db.get_name(item_id)
            print(f"    -> Identificado: {name} ({item_id})")
        else:
            # Novo item! Salvar com hash
            item_id = item_db.add_item(phash, dhash, slot)

        items_found.append({
            "item_id": item_id,
            "qty": 1,
            "position": [row, col],
        })

    # Detectar mapa
    map_name = detect_current_map(screen)

    # Registrar no log
    if items_found:
        entry = drop_logger.log_run(map_name, items_found)
        print(f"\n  Registrado: {len(items_found)} items no mapa '{map_name}'")
        print(f"  Run ID: {entry['id']}")
    else:
        # Mesmo sem items, registrar a run vazia
        entry = drop_logger.log_run(map_name, [])
        print(f"\n  Run registrada SEM items (mapa: {map_name})")

    # Mostrar estatísticas atuais
    stats = drop_logger.get_stats(map_name)
    if stats["items"]:
        print(f"\n  --- Estatísticas ({map_name}) ---")
        print(f"  Total runs: {stats['total_runs']}")
        for iid, s in stats["items"].items():
            name = item_db.get_name(iid)
            print(f"    {name}: {s['count']}x ({s['drop_rate']}%)")


def calibrate_mode(item_db: ItemDatabase):
    """
    Modo de calibração: captura a tela uma vez e mostra
    o que foi detectado para ajuste de parâmetros.
    """
    print("\n" + "=" * 60)
    print("  MODO CALIBRAÇÃO")
    print("  Abra o jogo com o diálogo 'Registro de Item' visível")
    print("  Pressione Enter quando estiver pronto...")
    print("=" * 60)
    input()

    screen = capture_screen()
    debug_path = BASE_DIR / "debug"
    debug_path.mkdir(exist_ok=True)

    cv2.imwrite(str(debug_path / "calibrate_full_screen.png"), screen)
    print(f"  Screenshot salvo em debug/calibrate_full_screen.png")

    dialog = find_dialog_region(screen)
    if dialog is None:
        print("  [!] Diálogo NÃO detectado!")
        print("  Tente ajustar os parâmetros de cor em find_dialog_region()")
        print("  Ou use o modo --template para criar um template.")
        return

    x, y, w, h = dialog
    print(f"  Diálogo encontrado em: x={x} y={y} w={w} h={h}")

    # Desenhar retângulo no screenshot
    annotated = screen.copy()
    cv2.rectangle(annotated, (x, y), (x + w, y + h), (0, 255, 0), 3)

    # Extrair e desenhar grid
    grid = extract_grid_region(screen, dialog)
    cv2.imwrite(str(debug_path / "calibrate_grid.png"), grid)

    slots = extract_item_slots(grid)
    for i, slot in enumerate(slots):
        row = i // GRID_COLS
        col = i % GRID_COLS
        empty = is_slot_empty(slot)
        status = "VAZIO" if empty else "ITEM"
        cv2.imwrite(str(debug_path / f"calibrate_slot_{row}_{col}.png"), slot)

        if not empty:
            icon = extract_item_icon(slot)
            pil_img = Image.fromarray(cv2.cvtColor(icon, cv2.COLOR_BGR2RGB))
            phash = compute_phash(pil_img)
            print(f"  Slot [{row},{col}]: {status} | phash={phash}")
        else:
            print(f"  Slot [{row},{col}]: {status}")

    cv2.imwrite(str(debug_path / "calibrate_annotated.png"), annotated)
    print(f"\n  Imagens salvas em {debug_path}/")
    print("  Verifique se a detecção está correta e ajuste os parâmetros.")


def save_template_mode():
    """Salva um template do título para template matching."""
    print("\n" + "=" * 60)
    print("  SALVAR TEMPLATE")
    print("  Abra o jogo com o diálogo 'Registro de Item' visível")
    print("  Pressione Enter quando estiver pronto...")
    print("=" * 60)
    input()

    screen = capture_screen()
    debug_path = BASE_DIR / "debug"
    debug_path.mkdir(exist_ok=True)

    cv2.imwrite(str(debug_path / "template_full.png"), screen)
    print("  Screenshot salvo!")
    print("  Agora recorte manualmente o título 'Registro de Item'")
    print(f"  e salve como: {BASE_DIR / 'template_title.png'}")
    print("  Isso vai melhorar a detecção do diálogo.")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Grand Chase - Screen Drop Tracker")
    parser.add_argument("--calibrate", action="store_true",
                       help="Modo calibração: captura uma tela e mostra detecção")
    parser.add_argument("--template", action="store_true",
                       help="Salva screenshot para criar template do título")
    parser.add_argument("--stats", action="store_true",
                       help="Mostra estatísticas de drop")
    parser.add_argument("--map", type=str, default=None,
                       help="Define o mapa atual (ex: templo_do_tempo)")
    parser.add_argument("--interval", type=float, default=SCAN_INTERVAL,
                       help=f"Intervalo entre scans em segundos (default: {SCAN_INTERVAL})")
    parser.add_argument("--tolerance", type=int, default=12,
                       help="Tolerância de hash para matching (default: 12)")
    args = parser.parse_args()

    global CURRENT_MAP, HASH_TOLERANCE
    if args.map:
        CURRENT_MAP = args.map
    HASH_TOLERANCE = args.tolerance

    item_db = ItemDatabase()
    drop_logger = DropLogger()

    if args.calibrate:
        calibrate_mode(item_db)
        return

    if args.template:
        save_template_mode()
        return

    if args.stats:
        print("\n=== ESTATÍSTICAS DE DROP ===\n")
        stats = drop_logger.get_stats(args.map)
        print(f"Total runs: {stats['total_runs']}")
        if stats["items"]:
            print(f"\nItems:")
            for iid, s in stats["items"].items():
                name = item_db.get_name(iid)
                print(f"  {name}: {s['count']}x ({s['drop_rate']}% drop rate)")
        else:
            print("Nenhum item registrado ainda.")
        return

    # ── Modo principal: monitorar tela ──
    print("\n" + "=" * 60)
    print("  GRAND CHASE - DROP TRACKER")
    print("=" * 60)
    print(f"  Mapa atual: {CURRENT_MAP}")
    print(f"  Intervalo: {args.interval}s")
    print(f"  Tolerância hash: {HASH_TOLERANCE}")
    print(f"  Items conhecidos: {len(item_db.items)}")
    print(f"  Runs registradas: {len(drop_logger.logs)}")
    print(f"\n  Pressione Ctrl+C para parar")
    print("=" * 60)

    last_detection_time = 0
    last_grid_hash = None
    template_path = str(BASE_DIR / "template_title.png")

    try:
        while True:
            screen = capture_screen()

            # Tentar detectar diálogo
            dialog = None

            # Primeiro tentar template matching (mais preciso)
            if os.path.exists(template_path):
                match_loc = find_dialog_by_template(screen, template_path)
                if match_loc:
                    # Estimar as dimensões do diálogo baseado na posição do título
                    h_screen, w_screen = screen.shape[:2]
                    # O diálogo é tipicamente ~47% da largura e ~65% da altura
                    dw = int(w_screen * 0.47)
                    dh = int(h_screen * 0.70)
                    dx = match_loc[0] - int(dw * 0.1)
                    dy = match_loc[1] - int(dh * 0.02)
                    dialog = (dx, dy, dw, dh)

            # Fallback: detecção por cor
            if dialog is None:
                dialog = find_dialog_region(screen)

            if dialog is None:
                time.sleep(args.interval)
                continue

            # Anti-dupla detecção: verificar cooldown
            now = time.time()
            if now - last_detection_time < DIALOG_COOLDOWN:
                time.sleep(args.interval)
                continue

            # Anti-dupla: verificar se o grid mudou (hash da região)
            grid = extract_grid_region(screen, dialog)
            if grid.size > 0:
                grid_small = cv2.resize(grid, (64, 64))
                grid_pil = Image.fromarray(cv2.cvtColor(grid_small, cv2.COLOR_BGR2RGB))
                current_grid_hash = compute_phash(grid_pil)

                if last_grid_hash and hash_distance(current_grid_hash, last_grid_hash) < 5:
                    time.sleep(args.interval)
                    continue

                last_grid_hash = current_grid_hash

            # Processar!
            last_detection_time = now
            process_dialog(screen, dialog, item_db, drop_logger)

            # Esperar mais um pouco pós-detecção
            time.sleep(DIALOG_COOLDOWN)

    except KeyboardInterrupt:
        print("\n\n  Tracker finalizado!")
        stats = drop_logger.get_stats()
        print(f"  Total runs registradas: {stats['total_runs']}")
        if stats["items"]:
            print(f"\n  Resumo de drops:")
            for iid, s in stats["items"].items():
                name = item_db.get_name(iid)
                print(f"    {name}: {s['count']}x ({s['drop_rate']}%)")


if __name__ == "__main__":
    main()
