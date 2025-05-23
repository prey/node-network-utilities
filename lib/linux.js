"use strict";

var os    = require('os'),
    exec  = require('child_process').exec,
    async = require('async');

function trim_exec(cmd, cb) {
  exec(cmd, function(err, out) {
    if (out && out.toString() != '')
      cb(null, out.toString().trim())
    else
      cb(err)
  })
}

function ensure_valid_nic(str) {
  // Allow letters, numbers, -, _, and space
  if (!/^[\w\- ]+$/.test(str))
    throw new Error("Invalid nic name given: " + str);
}

// If no wifi, then there is no error but cbed get's a null in second param.
exports.get_active_network_interface_name = function(cb) {
  try {
    var cmd = "netstat -rn | grep UG | awk '{print $NF}'";
    exec(cmd, function(err, stdout, stderr) {
      if (err) return cb(err);

      if (stderr.toString().match('not found')) {
        return cb(new Error('Command failed: ' + stderr.toString().trim()))
      }

      var raw = stdout.toString().trim().split('\n');
      if (raw.length === 0 || (raw.length === 1 && raw[0] === ''))
        return cb(new Error('No active network interface found.'));

      cb(null, raw[0]);
    });
  } catch (e) {
    cb(e);
  }
};

exports.interface_type_for = function(nic_name, cb) {
  try {
    ensure_valid_nic(nic_name);
    exec('cat /proc/net/wireless | grep ' + nic_name, function(err, out) {
      return cb(null, err ? 'Wired' : 'Wireless')
    })
  } catch (e) {
    cb(e);
  }
};

exports.mac_address_for = function(nic_name, cb) {
  try {
    ensure_valid_nic(nic_name);
    var cmd = 'cat /sys/class/net/' + nic_name + '/address';
    trim_exec(cmd, cb);
  } catch (e) {
    cb(e);
  }
};

exports.gateway_ip_for = function(nic_name, cb) {
  try {
    ensure_valid_nic(nic_name);
    trim_exec("ip r | grep " + nic_name + " | grep default | cut -d ' ' -f 3 | head -n1", cb);
  } catch (e) {
    cb(e);
  }
};

exports.netmask_for = function(nic_name, cb) {
  try {
    ensure_valid_nic(nic_name);
    var cmd = "ifconfig " + nic_name + " 2> /dev/null | egrep 'netmask|Mask:' | awk '{print $4}' | sed 's/Mask://'";
    trim_exec(cmd, cb);
  } catch (e) {
    cb(e);
  }
};

exports.get_network_interfaces_list = function(cb) {

  var count = 0,
      list = [],
      nics = os.networkInterfaces();

  function append_data(obj) {
    async.parallel([
      function(cb) {
        exports.mac_address_for(obj.name, cb)
      },
      function(cb) {
        exports.gateway_ip_for(obj.name, cb)
      },
      function(cb) {
        exports.netmask_for(obj.name, cb)
      },
      function(cb) {
        exports.interface_type_for(obj.name, cb)
      }
    ], function(err, results) {
      if (results[0]) obj.mac_address = results[0];
      if (results[1]) obj.gateway_ip  = results[1];
      if (results[2]) obj.netmask     = results[2];
      if (results[3]) obj.type        = results[3];
      
      list.push(obj);
      --count || cb(null, list);
    })
  }

  for (var key in nics) {
    if (key != 'lo0' && key != 'lo' && !key.match(/^tun/)) {

      count++;
      var obj = { name: key };

      nics[key].forEach(function(type) {
        if (type.family == 'IPv4') {
          obj.ip_address = type.address;
        }
      });

      append_data(obj);
    }
  }

  if (count == 0)
    cb(new Error('No interfaces found.'))
}

