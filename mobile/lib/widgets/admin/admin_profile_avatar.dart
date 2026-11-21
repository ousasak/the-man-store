import 'package:flutter/material.dart';

import '../../models/user_model.dart';
import '../../utils/media_url.dart';
import '../product_image.dart';

/// Admin account avatar — profile photo or initials (not store logo).
class AdminProfileAvatar extends StatelessWidget {
  const AdminProfileAvatar({
    super.key,
    required this.user,
    this.radius = 18,
    this.showCameraBadge = false,
  });

  final UserModel user;
  final double radius;
  final bool showCameraBadge;

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    final imageUrl = resolveMediaUrl(user.profileImageUrl);
    final initial = user.name.trim().isNotEmpty ? user.name.trim()[0].toUpperCase() : 'A';

    return Stack(
      clipBehavior: Clip.none,
      children: [
        CircleAvatar(
          radius: radius,
          backgroundColor: primary.withValues(alpha: 0.15),
          child: imageUrl.isNotEmpty
              ? ClipOval(
                  child: SizedBox(
                    width: radius * 2,
                    height: radius * 2,
                    child: ProductImage(imageUrl: imageUrl, fit: BoxFit.cover),
                  ),
                )
              : Text(
                  initial,
                  style: TextStyle(
                    fontSize: radius * 0.9,
                    fontWeight: FontWeight.w800,
                    color: primary,
                  ),
                ),
        ),
        if (showCameraBadge)
          Positioned(
            right: -2,
            bottom: -2,
            child: Container(
              width: radius * 0.75,
              height: radius * 0.75,
              decoration: BoxDecoration(
                color: primary,
                shape: BoxShape.circle,
                border: Border.all(color: Theme.of(context).scaffoldBackgroundColor, width: 2),
              ),
              child: Icon(Icons.camera_alt_rounded, size: radius * 0.4, color: Colors.white),
            ),
          ),
      ],
    );
  }
}
