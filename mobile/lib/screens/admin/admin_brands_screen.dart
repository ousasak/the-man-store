import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/app_config.dart';
import '../../core/admin_permissions.dart';
import '../../core/api_client.dart';
import '../../models/brand_model.dart';
import '../../models/user_model.dart';
import '../../services/admin_service.dart';
import '../../utils/media_url.dart';
import '../../widgets/admin/admin_access_denied.dart';
import '../../widgets/admin/admin_ui_kit.dart';
import '../../widgets/common/fs_empty_state.dart';
import '../../widgets/product_image.dart';

class AdminBrandsScreen extends StatefulWidget {
  const AdminBrandsScreen({super.key, required this.user});

  final UserModel user;

  @override
  State<AdminBrandsScreen> createState() => _AdminBrandsScreenState();
}

class _AdminBrandsScreenState extends State<AdminBrandsScreen> {
  final _search = TextEditingController();
  final _items = <BrandModel>[];
  bool _loading = true;
  String? _error;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await AdminService(context.read<ApiClient>()).fetchBrands();
      if (!mounted) return;
      setState(() {
        _items
          ..clear()
          ..addAll(items);
        _loading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = context.read<ApiClient>().apiMessage(e);
        _loading = false;
      });
    }
  }

  List<BrandModel> get _visible {
    final q = _search.text.trim().toLowerCase();
    if (q.isEmpty) return _items;
    return _items.where((b) => b.name.toLowerCase().contains(q) || (b.slug ?? '').toLowerCase().contains(q)).toList();
  }

  Future<void> _openWebEditor() async {
    final uri = Uri.parse('${AppConfig.storefrontUrl}/admin/brands');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open brand manager in browser')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!AdminPermissions.has(widget.user, 'brands', 'view')) {
      return AdminModuleScaffold(
        title: 'Brands',
        body: const AdminAccessDenied(title: 'Brands access denied'),
      );
    }

    return AdminModuleScaffold(
      title: 'Brands',
      actions: (AdminPermissions.has(widget.user, 'brands', 'create') ||
              AdminPermissions.has(widget.user, 'brands', 'edit'))
          ? [
              IconButton(
                tooltip: 'Open web editor',
                onPressed: _openWebEditor,
                icon: const Icon(Icons.open_in_browser_rounded),
              ),
            ]
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              controller: _search,
              decoration: const InputDecoration(
                hintText: 'Search brands…',
                prefixIcon: Icon(Icons.search_rounded),
              ),
              onChanged: (_) => setState(() {}),
            ),
          ),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return FsEmptyState(
        icon: Icons.cloud_off_outlined,
        title: 'Could not load brands',
        subtitle: _error,
        actionLabel: 'Retry',
        onAction: _load,
      );
    }
    final visible = _visible;
    if (visible.isEmpty) {
      return FsEmptyState(
        icon: Icons.bookmark_outline,
        title: 'No brands found',
        subtitle: _search.text.trim().isEmpty ? null : 'Try another search term',
        actionLabel: AdminPermissions.has(widget.user, 'brands', 'create') ? 'Add on web' : null,
        onAction: AdminPermissions.has(widget.user, 'brands', 'create') ? _openWebEditor : null,
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        itemCount: visible.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (context, index) {
          final brand = visible[index];
          final logoUrl = resolveMediaUrl(brand.logoUrl);
          return AdminListRow(
            index: index,
            title: brand.name,
            subtitle: brand.slug,
            onTap: _openWebEditor,
            leading: SizedBox(
              width: 56,
              height: 40,
              child: logoUrl.isNotEmpty
                  ? ProductImage(imageUrl: logoUrl, fit: BoxFit.contain)
                  : Center(
                      child: Text(
                        brand.name.isNotEmpty ? brand.name[0].toUpperCase() : '?',
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
                      ),
                    ),
            ),
          );
        },
      ),
    );
  }
}
