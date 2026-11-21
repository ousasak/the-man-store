class BrandModel {
  BrandModel({
    required this.id,
    required this.name,
    this.slug,
    this.logoUrl,
  });

  final int id;
  final String name;
  final String? slug;
  final String? logoUrl;

  factory BrandModel.fromJson(Map<String, dynamic> json) => BrandModel(
        id: _parseId(json['id']),
        name: (json['name'] ?? '').toString(),
        slug: json['slug']?.toString(),
        logoUrl: (json['logo_url'] ?? json['logo_path'])?.toString(),
      );

  static int _parseId(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}
