/*
 Navicat Premium Data Transfer

 Source Server         : hk
 Source Server Type    : MySQL
 Source Server Version : 80032
 Source Host           : hk.zimoe.com:3306
 Source Schema         : mail

 Target Server Type    : MySQL
 Target Server Version : 80032
 File Encoding         : 65001

 Date: 06/04/2023 01:48:17
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for domains
-- ----------------------------
DROP TABLE IF EXISTS `domains`;
CREATE TABLE `domains`  (
  `did` int UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '域名号',
  `domain` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '域名',
  `alia_domain` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '别名域名：此项不为空时，代表本域名为其它域名的别名',
  PRIMARY KEY (`did`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 5 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for mails
-- ----------------------------
DROP TABLE IF EXISTS `mails`;
CREATE TABLE `mails`  (
  `mid` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '邮件号',
  `uid` int UNSIGNED NOT NULL COMMENT '用户号',
  `content` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '邮件内容',
  `category` tinyint NOT NULL DEFAULT 0 COMMENT '类别：1=发件箱、0=收件箱、-1=垃圾箱',
  `created_time` timestamp NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`mid`, `uid`) USING BTREE,
  INDEX `uid`(`uid`) USING BTREE,
  CONSTRAINT `uid` FOREIGN KEY (`uid`) REFERENCES `users` (`uid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users`  (
  `uid` int UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户号',
  `username` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '用户名',
  `password` char(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '密码',
  `alia_username` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '别名用户：此项不为空时，代表本用户的用户名为其他用户的别名',
  `did` int UNSIGNED NOT NULL COMMENT '域名号',
  `admin` tinyint NOT NULL DEFAULT 0 COMMENT '域管理员：0为否，1为是；默认为否',
  PRIMARY KEY (`uid`) USING BTREE,
  INDEX `did`(`did`) USING BTREE,
  CONSTRAINT `did` FOREIGN KEY (`did`) REFERENCES `domains` (`did`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 3 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
