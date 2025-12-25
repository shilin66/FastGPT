/**
 * 从员工数据 (staffs) 和成员数据 (members) 中匹配信息，
 * 使用 members.memberName 匹配 staffs.fields.email。
 *
 * @param {Object} staffs - 员工数据对象。
 * @param {Array<Object>} members - 成员数据数组。
 * @returns {Array<Object>} - 包含 email, tmbId, callerId 的结果数组。
 */
function matchStaffsAndMembers(staffs, members) {
  // 1. 创建一个从员工 email 到员工数据的查找映射（Map），以便快速查找。
  // 键：staffs.fields.email
  // 值：{ email, id }
  const staffEmailMap = {};

  for (const key in staffs) {
    // 确保是对象自身的属性
    if (staffs.hasOwnProperty(key)) {
      const staffData = staffs[key];
      const email = staffData.fields.email;

      // 存储员工的 email 和 id (作为 callerId)
      staffEmailMap[email] = {
        email: email,
        callerId: staffData.fields.id
      };
    }
  }

  // 2. 遍历 members 数组，进行匹配和结果生成。
  const result = [];

  for (const member of members) {
    const memberName = member.memberName;
    const tmbId = member.tmbId;

    // 尝试用 memberName（期望是 email）在映射中查找匹配的员工数据
    if (staffEmailMap[memberName]) {
      const staff = staffEmailMap[memberName];

      // 找到匹配，创建结果对象并添加到结果数组
      result.push({
        email: staff.email,
        tmbId: tmbId,
        callerId: staff.callerId
      });
    }
  }

  return result;
}

// ----------------------------------------------------------------------
// 示例数据
// ----------------------------------------------------------------------

const staffs = {
  "Person::217": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "217",
    "fields": {
      "id": "217",
      "name": "8205",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "yuank@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Aaron 8205"
    }
  },
  "Person::48": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "48",
    "fields": {
      "id": "48",
      "name": "8100",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "lili@fashion-tele.com",
      "phone": "13817900201",
      "function": "service",
      "friendlyname": "amily 8100"
    }
  },
  "Person::2720": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "2720",
    "fields": {
      "id": "2720",
      "name": "8116",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "dub@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Andy 8116"
    }
  },
  "Person::2705": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "2705",
    "fields": {
      "id": "2705",
      "name": "8216",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "liwy@fashion-tele.com",
      "phone": "13237153211",
      "function": "service",
      "friendlyname": "Bobo 8216"
    }
  },
  "Person::3354": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "3354",
    "fields": {
      "id": "3354",
      "name": "8220",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "huy@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Fred 8220"
    }
  },
  "Person::2921": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "2921",
    "fields": {
      "id": "2921",
      "name": "8217",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "huangzt@fashion-tele.com",
      "phone": "17671775911",
      "function": "service",
      "friendlyname": "Harlan 8217"
    }
  },
  "Person::144": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "144",
    "fields": {
      "id": "144",
      "name": "8223",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "shenwq@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Jack 8223"
    }
  },
  "Person::3793": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "3793",
    "fields": {
      "id": "3793",
      "name": "8123",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "liudl@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Jason 8123"
    }
  },
  "Person::3353": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "3353",
    "fields": {
      "id": "3353",
      "name": "8221",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "liuth@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Jerry 8221"
    }
  },
  "Person::49": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "49",
    "fields": {
      "id": "49",
      "name": "8109",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "jijun@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Joanna 8109"
    }
  },
  "Person::75": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "75",
    "fields": {
      "id": "75",
      "name": "8201",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "yew@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Jonathon 8201"
    }
  },
  "Person::221": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "221",
    "fields": {
      "id": "221",
      "name": "8111",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "xuzf@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Joyce 8111"
    }
  },
  "Person::255": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "255",
    "fields": {
      "id": "255",
      "name": "8215",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "xujl@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Justin 8215"
    }
  },
  "Person::3361": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "3361",
    "fields": {
      "id": "3361",
      "name": "8301",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "tany@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Katrina 8301"
    }
  },
  "Person::74": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "74",
    "fields": {
      "id": "74",
      "name": "8106",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "jiazl@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Klay 8106"
    }
  },
  "Person::52": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "52",
    "fields": {
      "id": "52",
      "name": "8113",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "yinl@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Kratos 8113"
    }
  },
  "Person::54": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "54",
    "fields": {
      "id": "54",
      "name": "8101",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "liukm@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Kyle 8101"
    }
  },
  "Person::79": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "79",
    "fields": {
      "id": "79",
      "name": "8202",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "huangz@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Leo 8202"
    }
  },
  "Person::3795": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "3795",
    "fields": {
      "id": "3795",
      "name": "8311",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "tiany@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Lucas 8311"
    }
  },
  "Person::78": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "78",
    "fields": {
      "id": "78",
      "name": "8102",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "wangf@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Miracle 8102"
    }
  },
  "Person::212": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "212",
    "fields": {
      "id": "212",
      "name": "8207",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "qianzw@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Money 8207"
    }
  },
  "Person::3797": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "3797",
    "fields": {
      "id": "3797",
      "name": "8313",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "chenx@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Nicholas 8313"
    }
  },
  "Person::3794": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "3794",
    "fields": {
      "id": "3794",
      "name": "8310",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "wangzx@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Nick 8310"
    }
  },
  "Person::3150": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "3150",
    "fields": {
      "id": "3150",
      "name": "8218",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "panwt@fashion-tele.com",
      "phone": "13554221484",
      "function": "service",
      "friendlyname": "Nico 8218"
    }
  },
  "Person::3358": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "3358",
    "fields": {
      "id": "3358",
      "name": "8307",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "zoup@fashion-tele.com",
      "phone": "18723048032",
      "function": "service",
      "friendlyname": "Paddy 8307"
    }
  },
  "Person::77": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "77",
    "fields": {
      "id": "77",
      "name": "8105",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "sunar@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Pedro 8105"
    }
  },
  "Person::3041": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "3041",
    "fields": {
      "id": "3041",
      "name": "8120",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "yinyx@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Rain 8120"
    }
  },
  "Person::80": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "80",
    "fields": {
      "id": "80",
      "name": "8103",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "yuewb@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Robbin 8103"
    }
  },
  "Person::3792": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "3792",
    "fields": {
      "id": "3792",
      "name": "8122",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "fanghl@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Russell 8122"
    }
  },
  "Person::248": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "248",
    "fields": {
      "id": "248",
      "name": "8212",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "dujw@fashion-tele.com",
      "phone": "15527423700",
      "function": "service",
      "friendlyname": "Shady 8212"
    }
  },
  "Person::128": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "128",
    "fields": {
      "id": "128",
      "name": "8115",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "shenxy@fashion-tele.com",
      "phone": "13816143882",
      "function": "service",
      "friendlyname": "Shirley 8115"
    }
  },
  "Person::247": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "247",
    "fields": {
      "id": "247",
      "name": "8211",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "huanglj@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Simon 8211"
    }
  },
  "Person::3364": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "3364",
    "fields": {
      "id": "3364",
      "name": "8308",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "chenyh@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Simple 8308"
    }
  },
  "Person::3357": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "3357",
    "fields": {
      "id": "3357",
      "name": "8306",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "wangsy@fashion-tele.com",
      "phone": "18182296856",
      "function": "service",
      "friendlyname": "Snow 8306"
    }
  },
  "Person::57": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "57",
    "fields": {
      "id": "57",
      "name": "8112",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "huangxy@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Stephanie 8112"
    }
  },
  "Person::3360": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "3360",
    "fields": {
      "id": "3360",
      "name": "8305",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "kongsy@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Summer 8305"
    }
  },
  "Person::3356": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "3356",
    "fields": {
      "id": "3356",
      "name": "8309",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "zhouf@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Teemo 8309"
    }
  },
  "Person::56": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "56",
    "fields": {
      "id": "56",
      "name": "8104",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "baoy@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Tim 8104"
    }
  },
  "Person::17": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "17",
    "fields": {
      "id": "17",
      "name": "8199",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "mayiqing@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Tony 8199"
    }
  },
  "Person::249": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "249",
    "fields": {
      "id": "249",
      "name": "8213",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "daibl@fashion-tele.com",
      "phone": "13007165918",
      "function": "service",
      "friendlyname": "Waker 8213"
    }
  },
  "Person::246": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "246",
    "fields": {
      "id": "246",
      "name": "8210",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "zhangf@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Walt 8210"
    }
  },
  "Person::3355": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "3355",
    "fields": {
      "id": "3355",
      "name": "8303",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "luoy@fashion-tele.com",
      "phone": "",
      "function": "service",
      "friendlyname": "Young 8303"
    }
  },
  "Person::3359": {
    "code": 0,
    "message": "",
    "class": "Person",
    "key": "3359",
    "fields": {
      "id": "3359",
      "name": "8121",
      "status": "active",
      "org_id": "1",
      "org_name": "菲信_fashion-tele",
      "email": "sunml@fashion-tele.com",
      "phone": "17765181712",
      "function": "service",
      "friendlyname": "Zenith 8121"
    }
  }
};

const members = [
  {
    "userId": "68d539e8066bf1686e4a0f28",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "root",
    "avatar": "/imgs/avatar/RoyalBlueAvatar.svg",
    "tmbId": "68d539e8066bf1686e4a0f31",
    "role": "owner",
    "status": "active",
    "createTime": "2025-09-25T12:47:36.031Z"
  },
  {
    "userId": "69081fec3d0f03fd41095979",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "lgweb@qq.com",
    "avatar": "/imgs/avatar/GrayModernAvatar.svg",
    "tmbId": "69081fec3d0f03fd4109597b",
    "status": "active",
    "createTime": "2025-11-03T03:22:20.699Z"
  },
  {
    "userId": "69158d503d0f03fd410b30d4",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "xsh@fashion-tele.com",
    "avatar": "/imgs/avatar/TealAvatar.svg",
    "tmbId": "69158d503d0f03fd410b30d6",
    "status": "active",
    "createTime": "2025-11-13T07:48:32.110Z"
  },
  {
    "userId": "6916b9103d0f03fd410b667e",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "pengkh@fashion-tele.com",
    "avatar": "/imgs/avatar/PurpleAvatar.svg",
    "tmbId": "6916b9103d0f03fd410b6680",
    "status": "active",
    "createTime": "2025-11-14T05:07:28.238Z"
  },
  {
    "userId": "693b76563d0f03fd411b579b",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "baoy@fashion-tele.com",
    "avatar": "/imgs/avatar/PurpleAvatar.svg",
    "tmbId": "693b76563d0f03fd411b579d",
    "status": "active",
    "createTime": "2025-12-12T01:56:38.677Z"
  },
  {
    "userId": "693b77483d0f03fd411b5c76",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "sunml@fashion-tele.com",
    "avatar": "/imgs/avatar/TealAvatar.svg",
    "tmbId": "693b77483d0f03fd411b5c78",
    "status": "active",
    "createTime": "2025-12-12T02:00:40.363Z"
  },
  {
    "userId": "693b77e43d0f03fd411b5e64",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "tany@fashion-tele.com",
    "avatar": "/imgs/avatar/BrightBlueAvatar.svg",
    "tmbId": "693b77e43d0f03fd411b5e66",
    "status": "active",
    "createTime": "2025-12-12T02:03:16.458Z"
  },
  {
    "userId": "693b78643d0f03fd411b62f9",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "yew@fashion-tele.com",
    "avatar": "/imgs/avatar/PurpleAvatar.svg",
    "tmbId": "693b78643d0f03fd411b62fb",
    "status": "active",
    "createTime": "2025-12-12T02:05:24.907Z"
  },
  {
    "userId": "693b79783d0f03fd411b6e50",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "fanghl@fashion-tele.com",
    "avatar": "/imgs/avatar/GreenAvatar.svg",
    "tmbId": "693b79783d0f03fd411b6e52",
    "status": "active",
    "createTime": "2025-12-12T02:10:00.131Z"
  },
  {
    "userId": "693b79843d0f03fd411b6f0e",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "xujl@fashion-tele.com",
    "avatar": "/imgs/avatar/GrayModernAvatar.svg",
    "tmbId": "693b79843d0f03fd411b6f10",
    "status": "active",
    "createTime": "2025-12-12T02:10:12.565Z"
  },
  {
    "userId": "693b7a1a3d0f03fd411b7012",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "shenxy@fashion-tele.com",
    "avatar": "/imgs/avatar/AdoraAvatar.svg",
    "tmbId": "693b7a1a3d0f03fd411b7014",
    "status": "active",
    "createTime": "2025-12-12T02:12:42.353Z"
  },
  {
    "userId": "693b7b5f3d0f03fd411b7264",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "yinl@fashion-tele.com",
    "avatar": "/imgs/avatar/AdoraAvatar.svg",
    "tmbId": "693b7b5f3d0f03fd411b7266",
    "status": "active",
    "createTime": "2025-12-12T02:18:07.581Z"
  },
  {
    "userId": "693b7bd63d0f03fd411b749e",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "liukm@fashion-tele.com",
    "avatar": "/imgs/avatar/AdoraAvatar.svg",
    "tmbId": "693b7bd63d0f03fd411b74a0",
    "status": "active",
    "createTime": "2025-12-12T02:20:06.457Z"
  },
  {
    "userId": "693b7be83d0f03fd411b7511",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "jijun@fashion-tele.com",
    "avatar": "/imgs/avatar/OrangeAvatar.svg",
    "tmbId": "693b7be83d0f03fd411b7513",
    "status": "active",
    "createTime": "2025-12-12T02:20:24.775Z"
  },
  {
    "userId": "693b7da03d0f03fd411b79f6",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "jiazl@fashion-tele.com",
    "avatar": "/imgs/avatar/GrayModernAvatar.svg",
    "tmbId": "693b7da03d0f03fd411b79f8",
    "status": "active",
    "createTime": "2025-12-12T02:27:44.123Z"
  },
  {
    "userId": "693b7dd53d0f03fd411b7c61",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "zoup@fashion-tele.com",
    "avatar": "/imgs/avatar/TealAvatar.svg",
    "tmbId": "693b7dd53d0f03fd411b7c63",
    "status": "active",
    "createTime": "2025-12-12T02:28:37.389Z"
  },
  {
    "userId": "693b7dde3d0f03fd411b7d00",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "xuzf@fashion-tele.com",
    "avatar": "/imgs/avatar/AdoraAvatar.svg",
    "tmbId": "693b7dde3d0f03fd411b7d02",
    "status": "active",
    "createTime": "2025-12-12T02:28:46.235Z"
  },
  {
    "userId": "693b7de63d0f03fd411b7d97",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "zhouf@fashion-tele.com",
    "avatar": "/imgs/avatar/BrightBlueAvatar.svg",
    "tmbId": "693b7de63d0f03fd411b7d99",
    "status": "active",
    "createTime": "2025-12-12T02:28:54.566Z"
  },
  {
    "userId": "693b7e5b3d0f03fd411b837d",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "sunar@fashion-tele.com",
    "avatar": "/imgs/avatar/AdoraAvatar.svg",
    "tmbId": "693b7e5b3d0f03fd411b837f",
    "status": "active",
    "createTime": "2025-12-12T02:30:51.273Z"
  },
  {
    "userId": "693b7e953d0f03fd411b865c",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "chenx@fashion-tele.com",
    "avatar": "/imgs/avatar/BrightBlueAvatar.svg",
    "tmbId": "693b7e953d0f03fd411b865e",
    "status": "active",
    "createTime": "2025-12-12T02:31:49.244Z"
  },
  {
    "userId": "693b7e963d0f03fd411b86cf",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "huangxy@fashion-tele.com",
    "avatar": "/imgs/avatar/PurpleAvatar.svg",
    "tmbId": "693b7e963d0f03fd411b86d1",
    "status": "active",
    "createTime": "2025-12-12T02:31:50.546Z"
  },
  {
    "userId": "693b7f143d0f03fd411b8985",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "huangz@fashion-tele.com",
    "avatar": "/imgs/avatar/GrayModernAvatar.svg",
    "tmbId": "693b7f143d0f03fd411b8987",
    "status": "active",
    "createTime": "2025-12-12T02:33:56.969Z"
  },
  {
    "userId": "693b7fc73d0f03fd411b8c43",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "yuewb@fashion-tele.com",
    "avatar": "/imgs/avatar/RedAvatar.svg",
    "tmbId": "693b7fc73d0f03fd411b8c45",
    "status": "active",
    "createTime": "2025-12-12T02:36:55.697Z"
  },
  {
    "userId": "693b80183d0f03fd411b8fab",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "qianzw@fashion-tele.com",
    "avatar": "/imgs/avatar/GreenAvatar.svg",
    "tmbId": "693b80183d0f03fd411b8fad",
    "status": "active",
    "createTime": "2025-12-12T02:38:16.824Z"
  },
  {
    "userId": "693b80513d0f03fd411b916e",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "huanglj@fashion-tele.com",
    "avatar": "/imgs/avatar/PurpleAvatar.svg",
    "tmbId": "693b80513d0f03fd411b9170",
    "status": "active",
    "createTime": "2025-12-12T02:39:13.865Z"
  },
  {
    "userId": "693b806d3d0f03fd411b93c6",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "huy@fashion-tele.com",
    "avatar": "/imgs/avatar/RedAvatar.svg",
    "tmbId": "693b806d3d0f03fd411b93c8",
    "status": "active",
    "createTime": "2025-12-12T02:39:41.404Z"
  },
  {
    "userId": "693b80c23d0f03fd411b9791",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "yuank@fashion-tele.com",
    "avatar": "/imgs/avatar/RedAvatar.svg",
    "tmbId": "693b80c23d0f03fd411b9793",
    "status": "active",
    "createTime": "2025-12-12T02:41:06.678Z"
  },
  {
    "userId": "693b81033d0f03fd411b9acc",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "zhangf@fashion-tele.com",
    "avatar": "/imgs/avatar/GreenAvatar.svg",
    "tmbId": "693b81033d0f03fd411b9ace",
    "status": "active",
    "createTime": "2025-12-12T02:42:11.159Z"
  },
  {
    "userId": "693b814a3d0f03fd411b9e22",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "liuth@fashion-tele.com",
    "avatar": "/imgs/avatar/PurpleAvatar.svg",
    "tmbId": "693b814a3d0f03fd411b9e24",
    "status": "active",
    "createTime": "2025-12-12T02:43:22.311Z"
  },
  {
    "userId": "693b81743d0f03fd411b9edb",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "panwt@fashion-tele.com",
    "avatar": "/imgs/avatar/PurpleAvatar.svg",
    "tmbId": "693b81743d0f03fd411b9edd",
    "status": "active",
    "createTime": "2025-12-12T02:44:04.088Z"
  },
  {
    "userId": "693b817c3d0f03fd411b9f31",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "chenyh@fashion-tele.com",
    "avatar": "/imgs/avatar/BlueAvatar.svg",
    "tmbId": "693b817c3d0f03fd411b9f33",
    "status": "active",
    "createTime": "2025-12-12T02:44:12.830Z"
  },
  {
    "userId": "693b81a13d0f03fd411ba0da",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "huangzt@fashion-tele.com",
    "avatar": "/imgs/avatar/RedAvatar.svg",
    "tmbId": "693b81a13d0f03fd411ba0dc",
    "status": "active",
    "createTime": "2025-12-12T02:44:49.036Z"
  },
  {
    "userId": "693b81cf3d0f03fd411ba1ab",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "liwy@fashion-tele.com",
    "avatar": "/imgs/avatar/PurpleAvatar.svg",
    "tmbId": "693b81cf3d0f03fd411ba1ad",
    "status": "active",
    "createTime": "2025-12-12T02:45:35.719Z"
  },
  {
    "userId": "693b81e73d0f03fd411ba25d",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "wangf@fashion-tele.com",
    "avatar": "/imgs/avatar/TealAvatar.svg",
    "tmbId": "693b81e73d0f03fd411ba25f",
    "status": "active",
    "createTime": "2025-12-12T02:45:59.569Z"
  },
  {
    "userId": "693b81ff3d0f03fd411ba3d1",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "daibl@fashion-tele.com",
    "avatar": "/imgs/avatar/GrayModernAvatar.svg",
    "tmbId": "693b81ff3d0f03fd411ba3d3",
    "status": "active",
    "createTime": "2025-12-12T02:46:23.032Z"
  },
  {
    "userId": "693b82323d0f03fd411ba527",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "dujw@fashion-tele.com",
    "avatar": "/imgs/avatar/RoyalBlueAvatar.svg",
    "tmbId": "693b82323d0f03fd411ba529",
    "status": "active",
    "createTime": "2025-12-12T02:47:14.989Z"
  },
  {
    "userId": "693b82873d0f03fd411ba62e",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "lili@fashion-tele.com",
    "avatar": "/imgs/avatar/OrangeAvatar.svg",
    "tmbId": "693b82873d0f03fd411ba630",
    "status": "active",
    "createTime": "2025-12-12T02:48:39.141Z"
  },
  {
    "userId": "693b83613d0f03fd411ba88d",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "wangzx@fashion-tele.com",
    "avatar": "/imgs/avatar/OrangeAvatar.svg",
    "tmbId": "693b83613d0f03fd411ba88f",
    "status": "active",
    "createTime": "2025-12-12T02:52:17.044Z"
  },
  {
    "userId": "693b83783d0f03fd411ba970",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "wangsy@fashion-tele.com",
    "avatar": "/imgs/avatar/OrangeAvatar.svg",
    "tmbId": "693b83783d0f03fd411ba972",
    "status": "active",
    "createTime": "2025-12-12T02:52:40.282Z"
  },
  {
    "userId": "693b84d93d0f03fd411bb063",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "dub@fashion-tele.com",
    "avatar": "/imgs/avatar/AdoraAvatar.svg",
    "tmbId": "693b84d93d0f03fd411bb065",
    "status": "active",
    "createTime": "2025-12-12T02:58:33.752Z"
  },
  {
    "userId": "693b87363d0f03fd411bb2b9",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "liudl@fashion-tele.com",
    "avatar": "/imgs/avatar/GrayModernAvatar.svg",
    "tmbId": "693b87363d0f03fd411bb2bb",
    "status": "active",
    "createTime": "2025-12-12T03:08:38.167Z"
  },
  {
    "userId": "693b92cc3d0f03fd411bc68f",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "kongsy@fashion-tele.com",
    "avatar": "/imgs/avatar/BlueAvatar.svg",
    "tmbId": "693b92cc3d0f03fd411bc691",
    "status": "active",
    "createTime": "2025-12-12T03:58:04.340Z"
  },
  {
    "userId": "693b959b3d0f03fd411bc929",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "luoy@fashion-tele.com",
    "avatar": "/imgs/avatar/GrayModernAvatar.svg",
    "tmbId": "693b959b3d0f03fd411bc92b",
    "status": "active",
    "createTime": "2025-12-12T04:10:03.515Z"
  },
  {
    "userId": "693b96fe3d0f03fd411bcbcf",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "yinyx@fashion-tele.com",
    "avatar": "/imgs/avatar/RedAvatar.svg",
    "tmbId": "693b96fe3d0f03fd411bcbd1",
    "status": "active",
    "createTime": "2025-12-12T04:15:58.212Z"
  },
  {
    "userId": "693b985f3d0f03fd411bcd54",
    "teamId": "68d539e8066bf1686e4a0f2b",
    "memberName": "tiany@fashion-tele.com",
    "avatar": "/imgs/avatar/RedAvatar.svg",
    "tmbId": "693b985f3d0f03fd411bcd56",
    "status": "active",
    "createTime": "2025-12-12T04:21:51.996Z"
  }
];

// 运行函数并输出结果
const finalResult = matchStaffsAndMembers(staffs, members);
console.log(JSON.stringify(finalResult, null, 4));