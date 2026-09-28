terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0.1"
    }
  }
}

provider "docker" {}

resource "docker_image" "web" {
  name         = "nginx:1.27.5"
  keep_locally = true
}

resource "docker_container" "web" {
  name  = "cloudcmd-tf-lab"
  image = docker_image.web.image_id

  ports {
    internal = 80
    external = 18081
    ip       = "127.0.0.1"
  }
}
