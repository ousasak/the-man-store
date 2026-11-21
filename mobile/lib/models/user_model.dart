class UserModel {
  UserModel({
    required this.id,
    required this.name,
    required this.email,
    this.phone,
    this.role,
    this.status,
    this.address,
    this.profileImageUrl,
    this.effectiveAdminPermissions,
  });

  final int id;
  final String name;
  final String email;
  final String? phone;
  final String? role;
  final String? status;
  final String? address;
  final String? profileImageUrl;
  final Map<String, bool>? effectiveAdminPermissions;

  bool get isSuperAdmin => role?.toLowerCase() == 'superadmin';
  bool get isAdmin => isSuperAdmin || role?.toLowerCase() == 'admin';
  bool get isDriver => role?.toLowerCase() == 'driver';
  bool get isCustomer => !isAdmin && !isDriver;

  /// Storefront shop checkout — admins use Admin → Checkout (POS).
  bool get canPlaceStorefrontOrder => !isAdmin;

  String get roleLabel {
    final r = role?.trim();
    if (r == null || r.isEmpty) return 'Customer';
    return r[0].toUpperCase() + r.substring(1);
  }

  factory UserModel.fromJson(Map<String, dynamic> json) => UserModel(
        id: json['id'] as int,
        name: (json['name'] ?? '').toString(),
        email: (json['email'] ?? '').toString(),
        phone: json['phone']?.toString(),
        role: json['role']?.toString(),
        status: json['status']?.toString(),
        address: json['address']?.toString(),
        profileImageUrl: json['profile_image_url']?.toString(),
        effectiveAdminPermissions: parseAdminPermissions(json['effective_admin_permissions']),
      );

  static Map<String, bool>? parseAdminPermissions(dynamic raw) {
    if (raw is! Map) return null;
    return raw.map((k, v) => MapEntry(k.toString(), v == true));
  }

  UserModel copyWith({
    String? name,
    String? email,
    String? phone,
    String? address,
    String? profileImageUrl,
    Map<String, bool>? effectiveAdminPermissions,
  }) =>
      UserModel(
        id: id,
        name: name ?? this.name,
        email: email ?? this.email,
        phone: phone ?? this.phone,
        role: role,
        status: status,
        address: address ?? this.address,
        profileImageUrl: profileImageUrl ?? this.profileImageUrl,
        effectiveAdminPermissions: effectiveAdminPermissions ?? this.effectiveAdminPermissions,
      );
}
