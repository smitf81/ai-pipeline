import { LightEmitterId } from '../../constants/lightEmitterIds.js';

export const CREATURE_ATTACHMENT_CONTRACT = 'black-sky-bound.creature-attachment.v1';

export const CreatureAttachmentId = Object.freeze({
  SPEAR_LEAF: 'raider_spear_leaf_v1',
  SPEAR_BARBED: 'raider_spear_barbed_v1',
  SPEAR_BROAD: 'raider_spear_broad_v1',
  TORCH_PITCH_WRAP: 'raider_torch_pitch_wrap_v1',
  TORCH_BOUND_REEDS: 'raider_torch_bound_reeds_v1',
  TORCH_IRON_BASKET: 'raider_torch_iron_basket_v1',
  HEAD_COWL_MASK: 'raider_head_cowl_mask_v1',
  HEAD_WRAPPED_MASK: 'raider_head_wrapped_mask_v1',
  HEAD_SPLIT_HOOD: 'raider_head_split_hood_v1',
  SHOULDER_LEFT: 'raider_shoulder_pad_left_v1',
  SHOULDER_RIGHT: 'raider_shoulder_pad_right_v1',
  TORSO_CROSS_WRAP: 'raider_torso_cross_wrap_v1',
  TORSO_SPLIT_TUNIC: 'raider_torso_split_tunic_v1',
  BELT_ROPE: 'raider_belt_rope_v1',
  BELT_STUDDED: 'raider_belt_studded_v1',
  BACK_BEDROLL: 'raider_back_bedroll_v1',
  BACK_SUPPLY_PACK: 'raider_back_supply_pack_v1'
});

export const CREATURE_ATTACHMENTS = Object.freeze({
  [CreatureAttachmentId.SPEAR_LEAF]: attachment(CreatureAttachmentId.SPEAR_LEAF, 'primaryWeapon', 'spear', ['spear_front_grip_socket', 'spear_rear_grip_socket', 'spear_tip_socket'], ['wood', 'metal'], 'leaf'),
  [CreatureAttachmentId.SPEAR_BARBED]: attachment(CreatureAttachmentId.SPEAR_BARBED, 'primaryWeapon', 'spear', ['spear_front_grip_socket', 'spear_rear_grip_socket', 'spear_tip_socket'], ['wood', 'metal'], 'barbed'),
  [CreatureAttachmentId.SPEAR_BROAD]: attachment(CreatureAttachmentId.SPEAR_BROAD, 'primaryWeapon', 'spear', ['spear_front_grip_socket', 'spear_rear_grip_socket', 'spear_tip_socket'], ['wood', 'metal'], 'broad'),
  [CreatureAttachmentId.TORCH_PITCH_WRAP]: attachment(CreatureAttachmentId.TORCH_PITCH_WRAP, 'light', 'torch', ['torch_hand_socket', 'torch_tip_socket', 'torch_flame_socket'], ['wood', 'leather', 'fire'], 'pitch_wrap', LightEmitterId.TORCH),
  [CreatureAttachmentId.TORCH_BOUND_REEDS]: attachment(CreatureAttachmentId.TORCH_BOUND_REEDS, 'light', 'torch', ['torch_hand_socket', 'torch_tip_socket', 'torch_flame_socket'], ['wood', 'cloth', 'fire'], 'bound_reeds', LightEmitterId.TORCH),
  [CreatureAttachmentId.TORCH_IRON_BASKET]: attachment(CreatureAttachmentId.TORCH_IRON_BASKET, 'light', 'torch', ['torch_hand_socket', 'torch_tip_socket', 'torch_flame_socket'], ['wood', 'metal', 'fire'], 'iron_basket', LightEmitterId.TORCH),
  [CreatureAttachmentId.HEAD_COWL_MASK]: attachment(CreatureAttachmentId.HEAD_COWL_MASK, 'head', 'headwear', ['head_socket'], ['cloth', 'leather'], 'cowl_mask'),
  [CreatureAttachmentId.HEAD_WRAPPED_MASK]: attachment(CreatureAttachmentId.HEAD_WRAPPED_MASK, 'head', 'headwear', ['head_socket'], ['cloth'], 'wrapped_mask'),
  [CreatureAttachmentId.HEAD_SPLIT_HOOD]: attachment(CreatureAttachmentId.HEAD_SPLIT_HOOD, 'head', 'headwear', ['head_socket'], ['cloth', 'leather'], 'split_hood'),
  [CreatureAttachmentId.SHOULDER_LEFT]: attachment(CreatureAttachmentId.SHOULDER_LEFT, 'shoulder', 'shoulder_pad', ['left_shoulder_socket'], ['leather', 'metal'], 'left'),
  [CreatureAttachmentId.SHOULDER_RIGHT]: attachment(CreatureAttachmentId.SHOULDER_RIGHT, 'shoulder', 'shoulder_pad', ['right_shoulder_socket'], ['leather', 'metal'], 'right'),
  [CreatureAttachmentId.TORSO_CROSS_WRAP]: attachment(CreatureAttachmentId.TORSO_CROSS_WRAP, 'torso', 'torso_wrap', ['chest_socket', 'hips_socket'], ['cloth'], 'cross_wrap'),
  [CreatureAttachmentId.TORSO_SPLIT_TUNIC]: attachment(CreatureAttachmentId.TORSO_SPLIT_TUNIC, 'torso', 'torso_wrap', ['chest_socket', 'hips_socket'], ['cloth', 'leather'], 'split_tunic'),
  [CreatureAttachmentId.BELT_ROPE]: attachment(CreatureAttachmentId.BELT_ROPE, 'belt', 'belt', ['hips_socket'], ['leather'], 'rope'),
  [CreatureAttachmentId.BELT_STUDDED]: attachment(CreatureAttachmentId.BELT_STUDDED, 'belt', 'belt', ['hips_socket'], ['leather', 'metal'], 'studded'),
  [CreatureAttachmentId.BACK_BEDROLL]: attachment(CreatureAttachmentId.BACK_BEDROLL, 'back', 'pack', ['back_socket'], ['cloth', 'leather'], 'bedroll'),
  [CreatureAttachmentId.BACK_SUPPLY_PACK]: attachment(CreatureAttachmentId.BACK_SUPPLY_PACK, 'back', 'pack', ['back_socket'], ['cloth', 'leather'], 'supply_pack')
});

export function getCreatureAttachment(id) {
  const value = CREATURE_ATTACHMENTS[id];
  if (!value) throw new Error(`Unknown creature attachment: ${id}`);
  return value;
}

function attachment(id, slot, kind, socketIds, materialRoles, style, lightEmitterId = null) {
  return Object.freeze({
    contract: CREATURE_ATTACHMENT_CONTRACT,
    classification: 'renderer_neutral_creature_attachment_recipe',
    id,
    slot,
    kind,
    style,
    socketIds: Object.freeze([...socketIds]),
    materialRoles: Object.freeze([...materialRoles]),
    lightEmitterId
  });
}
