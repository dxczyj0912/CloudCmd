terraform {
  required_providers {
    tencentcloud = {
      source  = "tencentcloudstack/tencentcloud"
      version = "~> 1.82.0"
    }
  }
}

provider "tencentcloud" {}

resource "tencentcloud_security_group" "lab" {
  name        = "cloudcmd-tf-lab"
  description = "Temporary isolated Terraform training resource"
  tags = {
    purpose = "cloudcmd-lab"
  }
}

output "lab_security_group_id" {
  value = tencentcloud_security_group.lab.id
}
