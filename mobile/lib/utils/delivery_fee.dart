const _phnomPenhMarkers = [
  'phnom penh',
  'phnompenh',
  'pp',
  'ភ្នំពេញ',
  'រាជធានីភ្នំពេញ',
];

String normalizeProvince(String? province) {
  return (province ?? '')
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'\s+'), ' ');
}

bool isPhnomPenhProvince(String? province) {
  final normalized = normalizeProvince(province);
  if (normalized.isEmpty) return false;
  if (_phnomPenhMarkers.contains(normalized)) return true;
  return _phnomPenhMarkers.any(normalized.contains);
}
