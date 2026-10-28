import math
import re
import unicodedata

from .errors import MissingCountryCodes, PipelineError


def text(value, limit=300):
    return value.strip()[:limit] if isinstance(value, str) and value.strip() else None


def strings(value):
    if not isinstance(value, list):
        return []
    return list(dict.fromkeys(item for v in value if (item := text(v))))


def number(value, *, integer=False, minimum=0, maximum=None):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise PipelineError('REST Countries devolvió una medición no válida.')
    if value < minimum or (maximum is not None and value > maximum) or (integer and int(value) != value):
        raise PipelineError('REST Countries devolvió una medición fuera de rango.')
    return int(value) if integer else value


def fold(value):
    return ''.join(c for c in unicodedata.normalize('NFD', value.lower()) if not unicodedata.combining(c))


def normalize_country(source: dict) -> dict:
    """REST Countries v5 -> our explicit, provider-independent database schema."""
    if not isinstance(source, dict):
        raise PipelineError('El formato del catálogo de REST Countries no es válido.')
    names, codes = source.get('names') or {}, source.get('codes') or {}
    if not isinstance(names, dict) or not isinstance(codes, dict):
        raise PipelineError('REST Countries devolvió nombres o códigos no válidos.')
    code, alpha2 = text(codes.get('alpha_3')), text(codes.get('alpha_2'))
    name, region = text(names.get('common'), 200), text(source.get('region'), 80)
    if name and region and all(value is None or isinstance(value, str) and not value.strip()
                              for value in (codes.get('alpha_2'), codes.get('alpha_3'))):
        raise MissingCountryCodes('El registro del proveedor no tiene códigos ISO para este catálogo.')
    if not code or not re.fullmatch(r'[A-Z]{3}', code) or not alpha2 or not re.fullmatch(r'[A-Z]{2}', alpha2) or not name or not region:
        raise PipelineError('REST Countries devolvió un país sin código, nombre o región válidos.')
    translations = names.get('translations') or {}
    spanish = (translations.get('spa') or {}).get('common') if isinstance(translations, dict) else None
    native = names.get('native') or {}
    if not isinstance(native, dict):
        raise PipelineError('Los nombres nativos de un país no son válidos.')
    native = {lang: {'common': text(v.get('common')), 'official': text(v.get('official'))}
              for lang, v in native.items() if isinstance(v, dict)}
    capitals = [text(c.get('name')) for c in source.get('capitals') or [] if isinstance(c, dict)]
    capitals = list(dict.fromkeys(c for c in capitals if c))
    languages = [{'code': text(v.get('bcp47') or v.get('iso639_3')), 'name': text(v.get('name')),
                  'native_name': text(v.get('native_name'))}
                 for v in source.get('languages') or [] if isinstance(v, dict) and text(v.get('name'))]
    currencies = [{'code': text(v.get('code')), 'name': text(v.get('name')), 'symbol': text(v.get('symbol'))}
                  for v in source.get('currencies') or [] if isinstance(v, dict) and text(v.get('code'))]
    coordinates = source.get('coordinates') or {}
    classification = source.get('classification') or {}
    area = source.get('area') or {}
    official = text(names.get('official')) or name
    search = [name, official, text(spanish) or '', alpha2, code, *strings(names.get('alternates')),
              *[v['common'] or '' for v in native.values()], *[v['official'] or '' for v in native.values()]]
    return {
        'code': code, 'alpha2': alpha2, 'name': name, 'official_name': official,
        'spanish_name': text(spanish, 200), 'native_names': native, 'region': region,
        'subregion': text(source.get('subregion')), 'capitals': capitals,
        'population': number(source.get('population'), integer=True, maximum=10_000_000_000),
        'area_km2': number(area.get('kilometers')), 'languages': languages, 'currencies': currencies,
        'timezones': strings(source.get('timezones')), 'borders': strings(source.get('borders')),
        'continents': strings(source.get('continents')), 'calling_codes': strings(source.get('calling_codes')),
        'tlds': strings(source.get('tlds')),
        'latitude': number(coordinates.get('lat'), minimum=-90, maximum=90),
        'longitude': number(coordinates.get('lng'), minimum=-180, maximum=180),
        'independent': classification.get('sovereign') if isinstance(classification.get('sovereign'), bool) else None,
        'un_member': classification.get('un_member') if isinstance(classification.get('un_member'), bool) else None,
        'search_text': fold(' '.join(search)),
    }
