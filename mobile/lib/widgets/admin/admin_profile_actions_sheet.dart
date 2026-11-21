import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/admin_permissions.dart';
import '../../models/user_model.dart';
import '../../providers/auth_provider.dart';
import '../../screens/admin/admin_profile_edit_screen.dart';
import '../../services/admin_service.dart';
import '../../theme/admin_theme.dart';
import 'admin_password_sheet.dart';
import 'admin_profile_avatar.dart';

/// Profile actions — used only on Account screen (edit, photo, password).
Future<void> showAdminProfileActionsSheet(BuildContext context, {required UserModel user}) {
  return showModalBottomSheet<void>(
    context: context,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (_) => _AdminProfileActionsSheet(user: user),
  );
}

class _AdminProfileActionsSheet extends StatefulWidget {
  const _AdminProfileActionsSheet({required this.user});

  final UserModel user;

  @override
  State<_AdminProfileActionsSheet> createState() => _AdminProfileActionsSheetState();
}

class _AdminProfileActionsSheetState extends State<_AdminProfileActionsSheet> {
  final _picker = ImagePicker();
  bool _uploading = false;

  UserModel get _user => context.watch<AuthProvider>().user ?? widget.user;
  bool get _canEdit => AdminPermissions.has(_user, 'profile', 'edit');

  Future<void> _pickPhoto() async {
    if (!_canEdit || _uploading) return;
    final picked = await _picker.pickImage(source: ImageSource.gallery, maxWidth: 1200, imageQuality: 85);
    if (picked == null || !mounted) return;
    setState(() => _uploading = true);
    try {
      final url = await AdminService(context.read<ApiClient>()).uploadAdminProfileImage(File(picked.path));
      if (!mounted) return;
      final current = context.read<AuthProvider>().user ?? _user;
      context.read<AuthProvider>().updateUser(current.copyWith(profileImageUrl: url));
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profile photo updated')));
    } on DioException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.read<ApiClient>().apiMessage(e))),
      );
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = _user;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 40, height: 4, decoration: BoxDecoration(color: AdminColors.border, borderRadius: BorderRadius.circular(4))),
          const SizedBox(height: 16),
          AdminProfileAvatar(user: user, radius: 32, showCameraBadge: _canEdit),
          const SizedBox(height: 10),
          Text(user.name, style: Theme.of(context).textTheme.titleMedium),
          Text(user.email, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 16),
          if (_canEdit)
            ListTile(
              leading: _uploading
                  ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.photo_camera_outlined),
              title: const Text('Change profile photo'),
              onTap: _uploading ? null : _pickPhoto,
            ),
          if (_canEdit)
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('Edit profile'),
              subtitle: const Text('Name, email, phone, address'),
              onTap: () {
                Navigator.pop(context);
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => Theme(data: Theme.of(context), child: AdminProfileEditScreen(user: user)),
                  ),
                );
              },
            ),
          if (_canEdit)
            ListTile(
              leading: const Icon(Icons.lock_outline_rounded),
              title: const Text('Change password'),
              onTap: () {
                Navigator.pop(context);
                showAdminPasswordSheet(context);
              },
            ),
        ],
      ),
    );
  }
}
